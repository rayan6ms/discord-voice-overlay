// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    actorShouldAnchorRight,
    fitRectToMonitor,
    monitorForPoint,
} from './geometry.js';
import {EditHistory} from './edit-history.js';
import {
    readState,
} from './state.js';
import {StateMonitor} from './state-monitor.js';
import {UserListRenderer} from './user-list.js';
import {
    focusedWindowIdentity,
    listOpenApplicationsJson,
    windowIdentityCandidates,
} from './window-identity.js';


const AVATAR_SIZE_MIN = 20;
const AVATAR_SIZE_MAX = 64;
const AVATAR_SIZE_STEP = 2;

const NAME_WIDTH_MIN = 80;
const NAME_WIDTH_MAX = 320;
const NAME_WIDTH_STEP = 10;

const MAX_USERS_MIN = 1;
const MAX_USERS_MAX = 30;
const MAX_USERS_STEP = 1;

const OVERLAY_MARGIN = 8;
const PALETTE_GAP = 12;
const OVERLAY_HANDLE_GAP = 4;

const KEYBINDING_NAME = 'toggle-edit-mode';
const CANCEL_EDIT_KEYBINDING = 'cancel-edit';
const UNDO_EDIT_KEYBINDING = 'undo-edit';
const REDO_EDIT_KEYBINDING = 'redo-edit';
const EDIT_HISTORY_LIMIT = 100;
const DRAG_WATCHDOG_MS = 100;
const EXTENSION_VERSION = 26;
const APPLICATION_PICKER_PROTOCOL_VERSION = 2;

const IDENTITY_DBUS_PATH =
    '/org/gnome/Shell/Extensions/DiscordVoiceOverlay';

const IDENTITY_DBUS_XML = `
<node>
  <interface name="org.gnome.Shell.Extensions.DiscordVoiceOverlay">
    <method name="GetFocusedWindowIdentity">
      <arg name="identity" type="s" direction="out"/>
    </method>
    <method name="GetRuntimeVersion">
      <arg name="version" type="u" direction="out"/>
    </method>
    <method name="ListOpenApplications">
      <arg name="applicationsJson" type="s" direction="out"/>
    </method>
  </interface>
</node>`;


function runtimeStatePath() {
    const runtimeDir = GLib.getenv('XDG_RUNTIME_DIR');

    if (!runtimeDir)
        return null;

    return GLib.build_filenamev([
        runtimeDir,
        'discord-voice-overlay',
        'state.json',
    ]);
}



export default class DiscordVoiceOverlay extends Extension {
    enable() {
        this._settings = this.getSettings();

        const iconsDir =
            this.dir.get_child('icons');

        this._statusIcons = {
            muted: new Gio.FileIcon({
                file: iconsDir.get_child(
                    'microphone-muted-symbolic.svg'
                ),
            }),

            deafened: new Gio.FileIcon({
                file: iconsDir.get_child(
                    'headphones-deafened-symbolic.svg'
                ),
            }),
        };

        this._identityDbus =
            Gio.DBusExportedObject.wrapJSObject(
                IDENTITY_DBUS_XML,
                {
                    GetFocusedWindowIdentity() {
                        return focusedWindowIdentity();
                    },

                    GetRuntimeVersion() {
                        return EXTENSION_VERSION;
                    },

                    ListOpenApplications() {
                        return listOpenApplicationsJson(
                            APPLICATION_PICKER_PROTOCOL_VERSION,
                            EXTENSION_VERSION
                        );
                    },
                }
            );

        this._identityDbus.export(
            Gio.DBus.session,
            IDENTITY_DBUS_PATH
        );

        this._statePath = runtimeStatePath();
        this._stateMonitor = null;
        this._stateExpiryId = null;
        this._userListRenderer = null;

        this._editMode = false;
        this._editHistory = null;
        this._applyingEditState = false;
        this._editKeybindings = new Set();
        this._dragging = false;

        /*
         * Prevent each half of a two-coordinate save from immediately
         * reapplying the other coordinate's old value.
         */
        this._savingPosition = false;

        this._dragTarget = null;
        this._dragKind = null;
        this._dragGrab = null;
        this._dragWatchdogId = null;
        this._dragPointerStartX = 0;
        this._dragPointerStartY = 0;
        this._dragTargetStartX = 0;
        this._dragTargetStartY = 0;

        this._positionIdleId = null;

        this._lastRenderState = null;

        this._keybindingRegistered = false;

        this._lastGameMonitorIndex = null;

        this._monitorsChangedId = null;

        /*
         * Mutter's unredirect API is reference-counted, so call it only
         * on state transitions and always balance it during disable().
         */
        this._unredirectDisabled = false;

        this._settingsSignalIds = [];

        this._buildUi();
        this._userListRenderer =
            new UserListRenderer(
                this._userList,
                this._statusIcons,
                () =>
                    this._schedulePositionRefresh()
            );

        this._monitorsChangedId =
            Main.layoutManager.connect(
                'monitors-changed',
                () => {
                    this._schedulePositionRefresh();
                }
            );

        this._focusWindowId = global.display.connect(
            'notify::focus-window',
            () => {
                if (!this._gameIsFocused()) {
                    this._setEditMode(false);
                } else {
                    this._ensureGlobalOverlayPosition();
                    this._applySavedPosition();
                }

                /*
                 * Disable fullscreen unredirection before repainting
                 * the overlay. Some fullscreen XWayland games otherwise bypass
                 * the composited Shell scene after a focus transition.
                 */
                this._syncUnredirect();
                this._syncKeybinding();
                this._tick(true);
            }
        );

        for (const key of [
            'overlay-enabled',
            'speaking-only',
            'ring-inside',
            'avatar-size',
            'name-max-width',
            'max-visible-users',
            'toggle-edit-mode',

            'position-x',
            'position-y',
            'position-global',
            'anchor-right',

            'palette-position-x',
            'palette-position-y',
            'palette-position-set',

            'allowed-wm-classes',
        ]) {
            this._settingsSignalIds.push(
                this._settings.connect(
                    `changed::${key}`,
                    () => {
                        if (this._applyingEditState)
                            return;

                        const positionKeys = [
                            'position-x',
                            'position-y',
                            'position-global',
                            'anchor-right',
                            'palette-position-x',
                            'palette-position-y',
                            'palette-position-set',
                        ];

                        if (
                            this._savingPosition
                            && positionKeys.includes(key)
                        ) {
                            return;
                        }

                        if (
                            key === 'position-x'
                            || key === 'position-y'
                            || key === 'position-global'
                            || key === 'anchor-right'
                        ) {
                            this._applySavedPosition();
                        }

                        if (
                            key === 'palette-position-x'
                            || key === 'palette-position-y'
                            || key === 'palette-position-set'
                        ) {
                            this._applyPalettePosition();
                        }

                        if (key === 'allowed-wm-classes') {
                            this._syncUnredirect();
                            this._syncKeybinding();
                        }

                        if (key === 'toggle-edit-mode') {
                            if (this._keybindingRegistered) {
                                Main.wm.removeKeybinding(
                                    KEYBINDING_NAME
                                );

                                this._keybindingRegistered = false;
                            }

                            this._syncKeybinding();
                        }

                        this._refreshControls();

                        this._lastRenderState = null;
                        this._tick(true);
                    }
                )
            );
        }

        this._syncUnredirect();
        this._syncKeybinding();

        if (this._statePath) {
            this._stateMonitor =
                new StateMonitor(
                    this._statePath,
                    () => this._tick(false)
                );

            this._stateMonitor.start();
        }

        this._tick(true);
    }


    disable() {
        /*
         * Restore Mutter's normal fullscreen optimisation before
         * destroying any extension state.
         */
        this._setUnredirectDisabled(false);

        /*
         * A Clutter grab must be dismissed before its actor or captured
         * event handler is destroyed.
         */
        this._cancelDrag(false);
        this._removeEditKeybindings();

        if (this._keybindingRegistered) {
            Main.wm.removeKeybinding(
                KEYBINDING_NAME
            );

            this._keybindingRegistered = false;
        }

        if (this._stateMonitor) {
            this._stateMonitor.stop();
            this._stateMonitor = null;
        }

        if (this._stateExpiryId) {
            GLib.source_remove(
                this._stateExpiryId
            );

            this._stateExpiryId = null;
        }

        if (this._positionIdleId) {
            GLib.source_remove(
                this._positionIdleId
            );

            this._positionIdleId = null;
        }

        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(
                this._monitorsChangedId
            );

            this._monitorsChangedId = null;
        }

        if (this._focusWindowId) {
            global.display.disconnect(
                this._focusWindowId
            );

            this._focusWindowId = null;
        }

        if (this._settings) {
            for (const id of this._settingsSignalIds)
                this._settings.disconnect(id);
        }

        this._settingsSignalIds = [];

        if (this._userListRenderer) {
            this._userListRenderer.destroy();
            this._userListRenderer = null;
        }

        if (this._root) {
            Main.layoutManager.removeChrome(
                this._root
            );

            this._root.destroy();
            this._root = null;
        }

        if (this._toolbar) {
            Main.layoutManager.removeChrome(
                this._toolbar
            );

            this._toolbar.destroy();
            this._toolbar = null;
        }

        if (this._overlayDragHandle) {
            Main.layoutManager.removeChrome(
                this._overlayDragHandle
            );

            this._overlayDragHandle.destroy();
            this._overlayDragHandle = null;
        }
        this._dragHandle = null;
        this._overlayButton = null;
        this._speakingButton = null;
        this._ringButton = null;

        this._avatarSizeBox = null;
        this._avatarSizeDownButton = null;
        this._avatarSizeLabel = null;
        this._avatarSizeUpButton = null;

        this._nameWidthBox = null;
        this._nameWidthDownButton = null;
        this._nameWidthLabel = null;
        this._nameWidthUpButton = null;

        this._maxUsersBox = null;
        this._maxUsersDownButton = null;
        this._maxUsersLabel = null;
        this._maxUsersUpButton = null;

        this._doneButton = null;
        this._userList = null;

        if (this._identityDbus) {
            this._identityDbus.unexport();
            this._identityDbus = null;
        }

        this._settings = null;
        this._statusIcons = null;
        this._statePath = null;
        this._stateMonitor = null;
        this._stateExpiryId = null;
        this._userListRenderer = null;

        this._editMode = false;
        this._editHistory = null;
        this._applyingEditState = false;
        this._editKeybindings = null;
        this._dragging = false;
        this._dragTarget = null;
        this._dragKind = null;
        this._dragGrab = null;
        this._dragWatchdogId = null;
        this._dragPointerStartX = 0;
        this._dragPointerStartY = 0;
        this._dragTargetStartX = 0;
        this._dragTargetStartY = 0;
    }


    _buildUi() {
        this._root = new St.BoxLayout({
            style_class: 'dvo-root',
            vertical: true,

            reactive: false,
            can_focus: false,

            visible: false,
        });

        this._root.connect(
            'destroy',
            actor => {
                if (this._root !== actor)
                    return;

                this._userListRenderer?.abandon();
                this._userListRenderer = null;
                this._root = null;
                this._userList = null;
            }
        );

        this._applySavedPosition();


        this._toolbar = new St.BoxLayout({
            style_class: 'dvo-toolbar',
            vertical: true,
            width: 196,

            reactive: true,
            can_focus: false,

            visible: false,
        });

        this._toolbar.connect(
            'destroy',
            actor => {
                if (this._toolbar !== actor)
                    return;

                this._toolbar = null;
                this._dragHandle = null;
            }
        );


        this._dragHandle = new St.BoxLayout({
            style_class: 'dvo-drag-handle',
            vertical: false,
            x_expand: true,

            reactive: true,
            can_focus: false,
            track_hover: true,

            y_align: Clutter.ActorAlign.CENTER,
        });

        this._dragHandle.add_child(
            new St.Label({
                text: '⠿ Controls',
                style_class: 'dvo-drag-label',
                reactive: false,
            })
        );

        this._dragHandle.connect(
            'button-press-event',
            (actor, event) =>
                this._beginDrag(
                    event,
                    this._toolbar,
                    'palette',
                    actor
                )
        );

        this._dragHandle.connect(
            'motion-event',
            (_actor, event) =>
                this._onDragMotion(event)
        );

        this._dragHandle.connect(
            'button-release-event',
            (_actor, event) =>
                this._onDragRelease(event)
        );


        this._overlayButton = new St.Button({
            style_class: 'dvo-control-button',
            x_expand: true,
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._overlayButton.connect(
            'clicked',
            () => {
                this._performEdit(() => {
                    const value =
                        !this._settings.get_boolean(
                            'overlay-enabled'
                        );

                    this._settings.set_boolean(
                        'overlay-enabled',
                        value
                    );
                });
            }
        );


        this._speakingButton = new St.Button({
            style_class: 'dvo-control-button',
            x_expand: true,
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._speakingButton.connect(
            'clicked',
            () => {
                this._performEdit(() => {
                    const value =
                        !this._settings.get_boolean(
                            'speaking-only'
                        );

                    this._settings.set_boolean(
                        'speaking-only',
                        value
                    );
                });
            }
        );


        this._ringButton = new St.Button({
            style_class: 'dvo-control-button',
            x_expand: true,
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._ringButton.connect(
            'clicked',
            () => {
                this._performEdit(() => {
                    const current =
                        this._settings.get_boolean(
                            'ring-inside'
                        );

                    this._settings.set_boolean(
                        'ring-inside',
                        !current
                    );
                });
            }
        );


        this._avatarSizeBox = new St.BoxLayout({
            style_class: 'dvo-size-control',
            vertical: false,
            x_expand: true,
            reactive: true,
            can_focus: false,
            y_align: Clutter.ActorAlign.CENTER,
        });


        this._avatarSizeDownButton = new St.Button({
            label: '−',
            width: 32,
            style_class: 'dvo-control-button dvo-size-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._avatarSizeDownButton.connect(
            'clicked',
            () => this._adjustAvatarSize(-AVATAR_SIZE_STEP)
        );


        this._avatarSizeLabel = new St.Label({
            style_class: 'dvo-size-label',
            reactive: false,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            can_focus: false,
            y_align: Clutter.ActorAlign.CENTER,
        });


        this._avatarSizeUpButton = new St.Button({
            label: '+',
            width: 32,
            style_class: 'dvo-control-button dvo-size-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._avatarSizeUpButton.connect(
            'clicked',
            () => this._adjustAvatarSize(AVATAR_SIZE_STEP)
        );


        this._avatarSizeBox.add_child(
            this._avatarSizeDownButton
        );

        this._avatarSizeBox.add_child(
            this._avatarSizeLabel
        );

        this._avatarSizeBox.add_child(
            this._avatarSizeUpButton
        );


        this._nameWidthBox = new St.BoxLayout({
            style_class: 'dvo-size-control',
            vertical: false,
            x_expand: true,
        });

        this._nameWidthDownButton = new St.Button({
            label: '−',
            width: 32,
            style_class: 'dvo-control-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._nameWidthDownButton.connect(
            'clicked',
            () => this._changeNameMaxWidth(
                -NAME_WIDTH_STEP
            )
        );

        this._nameWidthLabel = new St.Label({
            style_class: 'dvo-size-label',
            reactive: false,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._nameWidthUpButton = new St.Button({
            label: '+',
            width: 32,
            style_class: 'dvo-control-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._nameWidthUpButton.connect(
            'clicked',
            () => this._changeNameMaxWidth(
                NAME_WIDTH_STEP
            )
        );

        this._nameWidthBox.add_child(
            this._nameWidthDownButton
        );

        this._nameWidthBox.add_child(
            this._nameWidthLabel
        );

        this._nameWidthBox.add_child(
            this._nameWidthUpButton
        );


        this._maxUsersBox = new St.BoxLayout({
            style_class: 'dvo-size-control',
            vertical: false,
            x_expand: true,
        });

        this._maxUsersDownButton = new St.Button({
            label: '−',
            width: 32,
            style_class: 'dvo-control-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._maxUsersDownButton.connect(
            'clicked',
            () => this._changeMaxVisibleUsers(
                -MAX_USERS_STEP
            )
        );

        this._maxUsersLabel = new St.Label({
            style_class: 'dvo-size-label',
            reactive: false,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._maxUsersUpButton = new St.Button({
            label: '+',
            width: 32,
            style_class: 'dvo-control-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._maxUsersUpButton.connect(
            'clicked',
            () => this._changeMaxVisibleUsers(
                MAX_USERS_STEP
            )
        );

        this._maxUsersBox.add_child(
            this._maxUsersDownButton
        );

        this._maxUsersBox.add_child(
            this._maxUsersLabel
        );

        this._maxUsersBox.add_child(
            this._maxUsersUpButton
        );


        this._doneButton = new St.Button({
            label: 'Done',
            style_class: 'dvo-control-button',
            x_expand: true,
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._doneButton.connect(
            'clicked',
            () => this._setEditMode(false)
        );


        this._toolbar.add_child(
            this._dragHandle
        );

        this._toolbar.add_child(
            this._overlayButton
        );

        this._toolbar.add_child(
            this._speakingButton
        );

        this._toolbar.add_child(
            this._ringButton
        );

        this._toolbar.add_child(
            this._avatarSizeBox
        );

        this._toolbar.add_child(
            this._nameWidthBox
        );

        this._toolbar.add_child(
            this._maxUsersBox
        );

        this._toolbar.add_child(
            this._doneButton
        );


        this._overlayDragHandle = new St.BoxLayout({
            style_class:
                'dvo-drag-handle dvo-overlay-drag-handle',

            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            can_focus: false,
            track_hover: true,
            visible: false,
        });

        this._overlayDragHandle.connect(
            'destroy',
            actor => {
                if (
                    this._overlayDragHandle
                    !== actor
                ) {
                    return;
                }

                this._overlayDragHandle = null;
            }
        );

        this._overlayDragHandle.add_child(
            new St.Label({
                text: '⠿ Voice overlay',
                style_class: 'dvo-drag-label',
                reactive: false,
            })
        );

        this._overlayDragHandle.connect(
            'button-press-event',
            (actor, event) =>
                this._beginDrag(
                    event,
                    this._root,
                    'overlay',
                    actor
                )
        );

        this._overlayDragHandle.connect(
            'motion-event',
            (_actor, event) =>
                this._onDragMotion(event)
        );

        this._overlayDragHandle.connect(
            'button-release-event',
            (_actor, event) =>
                this._onDragRelease(event)
        );


        this._userList = new St.BoxLayout({
            style_class: 'dvo-user-list',
            vertical: true,

            reactive: false,
            can_focus: false,
        });


        /*
         * The drag handle is separate Shell chrome. Keeping it outside
         * this root means hiding edit mode cannot shift the user list.
         */
        this._root.add_child(
            this._userList
        );


        /*
         * addChrome() is inserted below Shell's top-window group.
         * That made this actor visible during Alt+Tab but hidden
         * behind the actual fullscreen game.
         *
         * addTopChrome() keeps it above fullscreen windows and popups.
         * trackFullscreen must remain false, otherwise Shell itself
         * hides the actor whenever that monitor is fullscreen.
         */
        Main.layoutManager.addTopChrome(
            this._root,
            {
                affectsStruts: false,
                trackFullscreen: false,
            }
        );

        Main.layoutManager.addTopChrome(
            this._overlayDragHandle,
            {
                affectsStruts: false,
                trackFullscreen: false,
            }
        );

        Main.layoutManager.addTopChrome(
            this._toolbar,
            {
                affectsStruts: false,
                trackFullscreen: false,
            }
        );


        this._refreshControls();
    }


    _allowedWmClasses() {
        return new Set(
            this._settings.get_strv(
                'allowed-wm-classes'
            )
        );
    }


    _windowIsAllowed(window) {
        if (!window)
            return false;

        const allowed =
            this._allowedWmClasses();

        return windowIdentityCandidates(
            window
        ).some(
            value => allowed.has(value)
        );
    }


    _focusedGameWindow() {
        const window =
            global.display.focus_window;

        return this._windowIsAllowed(window)
            ? window
            : null;
    }


    _gameIsFocused() {
        return this._focusedGameWindow() !== null;
    }


    _setUnredirectDisabled(disabled) {
        disabled = Boolean(disabled);

        if (
            disabled
            === this._unredirectDisabled
        ) {
            return;
        }

        const compositor =
            global.compositor
            ?? global.get_compositor?.();

        if (!compositor) {
            console.error(
                '[DiscordVoiceOverlay] Mutter compositor is unavailable.'
            );

            return;
        }

        try {
            if (disabled)
                compositor.disable_unredirect();
            else
                compositor.enable_unredirect();

            this._unredirectDisabled =
                disabled;

            console.log(
                '[DiscordVoiceOverlay] Fullscreen unredirect '
                + (
                    disabled
                        ? 'disabled while game is focused.'
                        : 'restored.'
                )
            );
        } catch (error) {
            console.error(
                '[DiscordVoiceOverlay] Could not change fullscreen '
                + 'unredirect state:',
                error
            );
        }
    }


    _syncUnredirect() {
        this._setUnredirectDisabled(
            this._gameIsFocused()
        );
    }


    _syncKeybinding() {
        if (!this._settings)
            return;

        const shouldRegister =
            this._gameIsFocused();


        if (
            shouldRegister
            && !this._keybindingRegistered
        ) {
            try {
                Main.wm.addKeybinding(
                    KEYBINDING_NAME,
                    this._settings,
                    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                    Shell.ActionMode.NORMAL,
                    () => {
                        if (!this._gameIsFocused())
                            return;

                        this._setEditMode(
                            !this._editMode
                        );
                    }
                );

                this._keybindingRegistered = true;
            } catch (error) {
                console.error(
                    '[DiscordVoiceOverlay] Could not register hotkey:',
                    error
                );
            }

            return;
        }


        if (
            !shouldRegister
            && this._keybindingRegistered
        ) {
            Main.wm.removeKeybinding(
                KEYBINDING_NAME
            );

            this._keybindingRegistered = false;
        }
    }


    _captureEditState() {
        return {
            overlayEnabled:
                this._settings.get_boolean(
                    'overlay-enabled'
                ),

            speakingOnly:
                this._settings.get_boolean(
                    'speaking-only'
                ),

            ringInside:
                this._settings.get_boolean(
                    'ring-inside'
                ),

            avatarSize:
                this._settings.get_int(
                    'avatar-size'
                ),

            nameMaxWidth:
                this._settings.get_int(
                    'name-max-width'
                ),

            maxVisibleUsers:
                this._settings.get_int(
                    'max-visible-users'
                ),

            positionX:
                this._settings.get_int(
                    'position-x'
                ),

            positionY:
                this._settings.get_int(
                    'position-y'
                ),

            positionGlobal:
                this._settings.get_boolean(
                    'position-global'
                ),

            anchorRight:
                this._settings.get_boolean(
                    'anchor-right'
                ),

            palettePositionX:
                this._settings.get_int(
                    'palette-position-x'
                ),

            palettePositionY:
                this._settings.get_int(
                    'palette-position-y'
                ),

            palettePositionSet:
                this._settings.get_boolean(
                    'palette-position-set'
                ),
        };
    }


    _applyEditState(snapshot) {
        if (!this._settings || !snapshot)
            return;

        this._applyingEditState = true;
        this._savingPosition = true;

        try {
            this._settings.set_boolean(
                'overlay-enabled',
                snapshot.overlayEnabled
            );

            this._settings.set_boolean(
                'speaking-only',
                snapshot.speakingOnly
            );

            this._settings.set_boolean(
                'ring-inside',
                snapshot.ringInside
            );

            this._settings.set_int(
                'avatar-size',
                snapshot.avatarSize
            );

            this._settings.set_int(
                'name-max-width',
                snapshot.nameMaxWidth
            );

            this._settings.set_int(
                'max-visible-users',
                snapshot.maxVisibleUsers
            );

            this._settings.set_int(
                'position-x',
                snapshot.positionX
            );

            this._settings.set_int(
                'position-y',
                snapshot.positionY
            );

            this._settings.set_boolean(
                'position-global',
                snapshot.positionGlobal
            );

            this._settings.set_boolean(
                'anchor-right',
                snapshot.anchorRight
            );

            this._settings.set_int(
                'palette-position-x',
                snapshot.palettePositionX
            );

            this._settings.set_int(
                'palette-position-y',
                snapshot.palettePositionY
            );

            this._settings.set_boolean(
                'palette-position-set',
                snapshot.palettePositionSet
            );
        } finally {
            this._savingPosition = false;
            this._applyingEditState = false;
        }

        this._applySavedPosition();
        this._applyPalettePosition();
        this._refreshControls();

        this._lastRenderState = null;
        this._tick(true);

        if (this._editMode)
            this._placeOverlayDragHandle();
    }


    _performEdit(callback) {
        callback();

        if (this._editMode && this._editHistory) {
            this._editHistory.record(
                this._captureEditState()
            );
        }
    }


    _undoEdit() {
        if (!this._editMode || !this._editHistory)
            return;

        if (this._dragging) {
            this._cancelDrag(true);
            return;
        }

        const snapshot =
            this._editHistory.undo();

        if (snapshot)
            this._applyEditState(snapshot);
    }


    _redoEdit() {
        if (
            !this._editMode
            || !this._editHistory
            || this._dragging
        ) {
            return;
        }

        const snapshot =
            this._editHistory.redo();

        if (snapshot)
            this._applyEditState(snapshot);
    }


    _registerEditKeybindings() {
        if (
            !this._settings
            || !this._editMode
            || !this._editKeybindings
        ) {
            return;
        }

        const definitions = [
            [
                CANCEL_EDIT_KEYBINDING,
                () => this._setEditMode(
                    false,
                    true
                ),
            ],

            [
                UNDO_EDIT_KEYBINDING,
                () => this._undoEdit(),
            ],

            [
                REDO_EDIT_KEYBINDING,
                () => this._redoEdit(),
            ],
        ];

        for (const [name, callback] of definitions) {
            if (this._editKeybindings.has(name))
                continue;

            try {
                Main.wm.addKeybinding(
                    name,
                    this._settings,
                    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                    Shell.ActionMode.NORMAL,
                    callback
                );

                this._editKeybindings.add(name);
            } catch (error) {
                console.error(
                    `[DiscordVoiceOverlay] Could not register ${name}:`,
                    error
                );
            }
        }
    }


    _removeEditKeybindings() {
        if (!this._editKeybindings)
            return;

        for (const name of this._editKeybindings) {
            try {
                Main.wm.removeKeybinding(name);
            } catch (error) {
                console.error(
                    `[DiscordVoiceOverlay] Could not remove ${name}:`,
                    error
                );
            }
        }

        this._editKeybindings.clear();
    }


    _setEditMode(enabled, discardChanges = false) {
        enabled = Boolean(enabled);

        if (enabled === this._editMode)
            return;

        if (
            enabled
            && !this._gameIsFocused()
        ) {
            return;
        }


        if (enabled) {
            this._editHistory =
                new EditHistory(
                    this._captureEditState(),
                    EDIT_HISTORY_LIMIT
                );
        } else {
            if (this._dragging)
                this._cancelDrag(true);

            if (
                discardChanges
                && this._editHistory
            ) {
                this._applyEditState(
                    this._editHistory.initial()
                );
            }

            this._removeEditKeybindings();
            this._editHistory = null;
        }

        this._editMode = enabled;

        if (enabled)
            this._registerEditKeybindings();

        if (this._overlayDragHandle)
            this._overlayDragHandle.visible = enabled;

        if (this._toolbar)
            this._toolbar.visible = enabled;

        if (enabled)
            this._schedulePositionRefresh();


        this._refreshControls();

        this._lastRenderState = null;
        this._tick(true);
    }


    _refreshControls() {
        if (
            !this._settings
            || !this._overlayButton
            || !this._speakingButton
            || !this._ringButton
            || !this._avatarSizeLabel
            || !this._avatarSizeDownButton
            || !this._avatarSizeUpButton
            || !this._nameWidthLabel
            || !this._nameWidthDownButton
            || !this._nameWidthUpButton
            || !this._maxUsersLabel
            || !this._maxUsersDownButton
            || !this._maxUsersUpButton
        ) {
            return;
        }


        const overlayEnabled =
            this._settings.get_boolean(
                'overlay-enabled'
            );

        const speakingOnly =
            this._settings.get_boolean(
                'speaking-only'
            );

        const ringInside =
            this._settings.get_boolean(
                'ring-inside'
            );

        const avatarSize =
            this._settings.get_int(
                'avatar-size'
            );

        const nameMaxWidth =
            this._settings.get_int(
                'name-max-width'
            );

        const maxVisibleUsers =
            this._settings.get_int(
                'max-visible-users'
            );


        this._overlayButton.label =
            overlayEnabled
                ? 'Overlay: ON'
                : 'Overlay: OFF';

        this._speakingButton.label =
            speakingOnly
                ? 'Speaking only: ON'
                : 'Speaking only: OFF';

        this._ringButton.label =
            ringInside
                ? 'Ring: INSIDE'
                : 'Ring: OUTSIDE';


        if (overlayEnabled)
            this._overlayButton.add_style_class_name('dvo-control-on');
        else
            this._overlayButton.remove_style_class_name('dvo-control-on');


        if (speakingOnly)
            this._speakingButton.add_style_class_name('dvo-control-on');
        else
            this._speakingButton.remove_style_class_name('dvo-control-on');


        if (ringInside)
            this._ringButton.add_style_class_name('dvo-control-on');
        else
            this._ringButton.remove_style_class_name('dvo-control-on');


        this._avatarSizeLabel.text =
            `Avatar ${avatarSize}px`;

        this._nameWidthLabel.text =
            `Name ${nameMaxWidth}px`;

        this._maxUsersLabel.text =
            `Users ${maxVisibleUsers}`;

        const canShrink =
            avatarSize > AVATAR_SIZE_MIN;

        const canGrow =
            avatarSize < AVATAR_SIZE_MAX;

        this._avatarSizeDownButton.reactive = canShrink;
        this._avatarSizeDownButton.opacity = canShrink ? 255 : 110;

        this._avatarSizeUpButton.reactive = canGrow;
        this._avatarSizeUpButton.opacity = canGrow ? 255 : 110;
    }


    _adjustAvatarSize(delta) {
        if (!this._settings)
            return;

        const current =
            this._settings.get_int(
                'avatar-size'
            );

        const next =
            Math.max(
                AVATAR_SIZE_MIN,
                Math.min(
                    AVATAR_SIZE_MAX,
                    current + delta
                )
            );

        if (next !== current) {
            this._performEdit(
                () => {
                    this._settings.set_int(
                        'avatar-size',
                        next
                    );
                }
            );
        }
    }


    _changeNameMaxWidth(delta) {
        const current =
            this._settings.get_int(
                'name-max-width'
            );

        const next =
            Math.max(
                NAME_WIDTH_MIN,
                Math.min(
                    NAME_WIDTH_MAX,
                    current + delta
                )
            );

        if (next !== current) {
            this._performEdit(
                () => {
                    this._settings.set_int(
                        'name-max-width',
                        next
                    );
                }
            );
        }
    }


    _changeMaxVisibleUsers(delta) {
        const current =
            this._settings.get_int(
                'max-visible-users'
            );

        const next =
            Math.max(
                MAX_USERS_MIN,
                Math.min(
                    MAX_USERS_MAX,
                    current + delta
                )
            );

        if (next !== current) {
            this._performEdit(
                () => {
                    this._settings.set_int(
                        'max-visible-users',
                        next
                    );
                }
            );
        }
    }


    _ensureGlobalOverlayPosition() {
        if (
            !this._settings
            || this._settings.get_boolean(
                'position-global'
            )
        ) {
            return;
        }

        const monitor =
            this._focusedMonitor();

        if (!monitor)
            return;

        const globalX =
            monitor.x
            + this._settings.get_int(
                'position-x'
            );

        const globalY =
            monitor.y
            + this._settings.get_int(
                'position-y'
            );

        this._savingPosition = true;

        try {
            this._settings.set_int(
                'position-x',
                Math.round(globalX)
            );

            this._settings.set_int(
                'position-y',
                Math.round(globalY)
            );

            this._settings.set_boolean(
                'anchor-right',
                false
            );

            this._settings.set_boolean(
                'position-global',
                true
            );
        } finally {
            this._savingPosition = false;
        }
    }


    _monitorForPoint(x, y) {
        const monitors =
            Main.layoutManager.monitors ?? [];

        return monitorForPoint(
            monitors,
            Main.layoutManager.primaryMonitor
                ?? null,
            x,
            y
        );
    }


    _monitorForActor(actor) {
        if (!actor)
            return null;

        return this._monitorForPoint(
            actor.x
                + Math.max(actor.width, 1) / 2,

            actor.y
                + Math.max(actor.height, 1) / 2
        );
    }


    _fitActorToMonitor(
        actor,
        monitor,
        proposedX = actor?.x ?? 0,
        proposedY = actor?.y ?? 0
    ) {
        if (!actor || !monitor)
            return [proposedX, proposedY];

        const width =
            Math.max(
                actor.width,
                40
            );

        const height =
            Math.max(
                actor.height,
                30
            );

        return fitRectToMonitor(
            width,
            height,
            monitor,
            proposedX,
            proposedY,
            OVERLAY_MARGIN
        );
    }


    _applySavedPosition() {
        if (
            !this._root
            || !this._settings
            || !this._settings.get_boolean(
                'position-global'
            )
        ) {
            return;
        }

        const anchorX =
            this._settings.get_int(
                'position-x'
            );

        const preferredY =
            this._settings.get_int(
                'position-y'
            );

        const anchorRight =
            this._settings.get_boolean(
                'anchor-right'
            );

        const width =
            Math.max(
                this._root.width,
                40
            );

        const preferredX =
            anchorRight
                ? anchorX - width
                : anchorX;

        const monitor =
            this._monitorForPoint(
                anchorX,
                preferredY
            );

        const [x, y] =
            this._fitActorToMonitor(
                this._root,
                monitor,
                preferredX,
                preferredY
            );

        this._root.set_position(
            Math.round(x),
            Math.round(y)
        );
    }


    _applyPalettePosition() {
        if (
            !this._toolbar
            || !this._settings
            || !this._editMode
        ) {
            return;
        }

        if (
            !this._settings.get_boolean(
                'palette-position-set'
            )
        ) {
            this._placePaletteNearOverlay();
            return;
        }

        const preferredX =
            this._settings.get_int(
                'palette-position-x'
            );

        const preferredY =
            this._settings.get_int(
                'palette-position-y'
            );

        const monitor =
            this._monitorForPoint(
                preferredX,
                preferredY
            );

        const [x, y] =
            this._fitActorToMonitor(
                this._toolbar,
                monitor,
                preferredX,
                preferredY
            );

        this._toolbar.set_position(
            Math.round(x),
            Math.round(y)
        );
    }


    _placePaletteNearOverlay() {
        if (
            !this._toolbar
            || !this._root
            || !this._settings
        ) {
            return;
        }

        const monitor =
            this._monitorForActor(
                this._root
            )
            ?? this._focusedMonitor();

        if (!monitor)
            return;

        const paletteWidth =
            Math.max(
                this._toolbar.width,
                180
            );

        let x =
            this._root.x
            + Math.max(this._root.width, 40)
            + PALETTE_GAP;

        const rightLimit =
            monitor.x
            + monitor.width
            - OVERLAY_MARGIN;

        if (x + paletteWidth > rightLimit) {
            x =
                this._root.x
                - paletteWidth
                - PALETTE_GAP;
        }

        const [fittedX, fittedY] =
            this._fitActorToMonitor(
                this._toolbar,
                monitor,
                x,
                this._root.y
            );

        this._toolbar.set_position(
            Math.round(fittedX),
            Math.round(fittedY)
        );

        this._savingPosition = true;

        try {
            this._settings.set_int(
                'palette-position-x',
                Math.round(fittedX)
            );

            this._settings.set_int(
                'palette-position-y',
                Math.round(fittedY)
            );

            this._settings.set_boolean(
                'palette-position-set',
                true
            );
        } finally {
            this._savingPosition = false;
        }
    }


    _placeOverlayDragHandle() {
        if (
            !this._editMode
            || !this._root
            || !this._overlayDragHandle
        ) {
            return;
        }

        const monitor =
            this._monitorForActor(
                this._root
            )
            ?? this._focusedMonitor();

        if (!monitor)
            return;

        const rootWidth =
            Math.max(
                this._root.width,
                40
            );

        const rootHeight =
            Math.max(
                this._root.height,
                24
            );

        const handleWidth =
            Math.max(
                this._overlayDragHandle.width,
                110
            );

        const handleHeight =
            Math.max(
                this._overlayDragHandle.height,
                28
            );

        /*
         * Centre the handle over the visible voice rows. Prefer placing
         * it above them, but place it below when the overlay is too
         * close to the monitor's top edge.
         */
        const preferredX =
            this._root.x
            + (
                rootWidth
                - handleWidth
            ) / 2;

        const aboveY =
            this._root.y
            - handleHeight
            - OVERLAY_HANDLE_GAP;

        const belowY =
            this._root.y
            + rootHeight
            + OVERLAY_HANDLE_GAP;

        const preferredY =
            aboveY
                >= monitor.y + OVERLAY_MARGIN
                ? aboveY
                : belowY;

        const [x, y] =
            this._fitActorToMonitor(
                this._overlayDragHandle,
                monitor,
                preferredX,
                preferredY
            );

        this._overlayDragHandle.set_position(
            Math.round(x),
            Math.round(y)
        );
    }


    _schedulePositionRefresh() {
        /*
         * Never restore saved coordinates while either actor is being
         * dragged. A callback queued before the drag also checks again
         * before changing any position.
         */
        if (
            this._dragging
            || this._positionIdleId
        ) {
            return;
        }

        this._positionIdleId =
            GLib.idle_add(
                GLib.PRIORITY_DEFAULT_IDLE,
                () => {
                    this._positionIdleId = null;

                    if (this._dragging)
                        return GLib.SOURCE_REMOVE;

                    this._applySavedPosition();

                    if (this._editMode) {
                        this._applyPalettePosition();
                        this._placeOverlayDragHandle();
                    }

                    return GLib.SOURCE_REMOVE;
                }
            );
    }


    _beginDrag(event, target, kind, grabActor) {
        if (
            !this._editMode
            || !target
            || !grabActor
            || this._dragging
        ) {
            return Clutter.EVENT_PROPAGATE;
        }

        if (
            event.get_button()
            !== Clutter.BUTTON_PRIMARY
        ) {
            return Clutter.EVENT_PROPAGATE;
        }

        /*
         * Cancel position fitting that may have been queued immediately
         * before the pointer press.
         */
        if (this._positionIdleId) {
            GLib.source_remove(
                this._positionIdleId
            );

            this._positionIdleId = null;
        }

        const [pointerX, pointerY] =
            event.get_coords();

        /*
         * Keep receiving motion and release events when the pointer moves
         * faster than the handle or leaves a window surface. Without an
         * explicit grab, the release can be lost and leave a stale drag.
         */
        try {
            this._dragGrab =
                global.stage.grab(grabActor);
        } catch (error) {
            console.error(
                '[DiscordVoiceOverlay] Could not grab input for dragging:',
                error
            );

            this._dragGrab = null;
            return Clutter.EVENT_PROPAGATE;
        }

        if (!this._dragGrab)
            return Clutter.EVENT_PROPAGATE;

        this._dragging = true;
        this._dragTarget = target;
        this._dragKind = kind;

        this._dragPointerStartX =
            pointerX;

        this._dragPointerStartY =
            pointerY;

        this._dragTargetStartX =
            target.x;

        this._dragTargetStartY =
            target.y;

        this._dragWatchdogId =
            GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                DRAG_WATCHDOG_MS,
                () => {
                    if (!this._dragging) {
                        this._dragWatchdogId = null;
                        return GLib.SOURCE_REMOVE;
                    }

                    try {
                        const [, , modifiers] =
                            global.get_pointer();

                        if (
                            modifiers
                            & Clutter.ModifierType.BUTTON1_MASK
                        ) {
                            return GLib.SOURCE_CONTINUE;
                        }
                    } catch (error) {
                        console.error(
                            '[DiscordVoiceOverlay] Could not inspect drag input:',
                            error
                        );
                    }

                    /*
                     * Never leave Shell input grabbed if a compositor or
                     * device edge case prevents the release signal.
                     */
                    this._dragWatchdogId = null;
                    this._completeDrag();

                    return GLib.SOURCE_REMOVE;
                }
            );

        return Clutter.EVENT_STOP;
    }


    _finishDrag(pointerX, pointerY) {
        const target =
            this._dragTarget;

        const kind =
            this._dragKind;

        if (!target)
            return;

        /*
         * The pointer is the user's destination. Actor-centre based
         * selection can choose the old monitor while a wide actor is
         * crossing a display boundary and snap it backwards.
         */
        const monitor =
            (
                Number.isFinite(pointerX)
                && Number.isFinite(pointerY)
                    ? this._monitorForPoint(
                        pointerX,
                        pointerY
                    )
                    : null
            )
            ?? this._monitorForActor(target)
            ?? this._focusedMonitor();

        if (!monitor)
            return;

        const [x, y] =
            this._fitActorToMonitor(
                target,
                monitor
            );

        target.set_position(
            Math.round(x),
            Math.round(y)
        );

        this._savingPosition = true;

        try {
            if (kind === 'overlay') {
                const width =
                    Math.max(
                        target.width,
                        40
                    );

                const anchorRight =
                    actorShouldAnchorRight(
                        target.x,
                        width,
                        monitor
                    );

                const anchorX =
                    anchorRight
                        ? target.x + width
                        : target.x;

                this._settings.set_int(
                    'position-x',
                    Math.round(anchorX)
                );

                this._settings.set_int(
                    'position-y',
                    Math.round(target.y)
                );

                this._settings.set_boolean(
                    'anchor-right',
                    anchorRight
                );

                this._settings.set_boolean(
                    'position-global',
                    true
                );
            } else if (kind === 'palette') {
                this._settings.set_int(
                    'palette-position-x',
                    Math.round(target.x)
                );

                this._settings.set_int(
                    'palette-position-y',
                    Math.round(target.y)
                );

                this._settings.set_boolean(
                    'palette-position-set',
                    true
                );
            }
        } finally {
            this._savingPosition = false;
        }

    }


    _clearDrag() {
        if (this._dragWatchdogId) {
            GLib.source_remove(
                this._dragWatchdogId
            );

            this._dragWatchdogId = null;
        }

        const grab =
            this._dragGrab;

        this._dragGrab = null;

        if (grab) {
            try {
                grab.dismiss();
            } catch (error) {
                console.error(
                    '[DiscordVoiceOverlay] Could not release drag input:',
                    error
                );
            }
        }

        this._dragging = false;
        this._dragTarget = null;
        this._dragKind = null;
        this._dragPointerStartX = 0;
        this._dragPointerStartY = 0;
        this._dragTargetStartX = 0;
        this._dragTargetStartY = 0;
    }


    _cancelDrag(restorePosition) {
        if (
            !this._dragging
            || !this._dragTarget
        ) {
            this._clearDrag();
            return;
        }

        const kind =
            this._dragKind;

        if (restorePosition) {
            this._dragTarget.set_position(
                this._dragTargetStartX,
                this._dragTargetStartY
            );
        }

        this._clearDrag();

        if (
            kind === 'overlay'
            && this._editMode
        ) {
            this._placeOverlayDragHandle();
        }

        this._schedulePositionRefresh();
    }


    _completeDrag(
        pointerX,
        pointerY,
        applyPointerPosition = false
    ) {
        if (
            !this._dragging
            || !this._dragTarget
        ) {
            return;
        }

        if (applyPointerPosition) {
            this._setDraggedPosition(
                this._dragTargetStartX
                    + pointerX
                    - this._dragPointerStartX,

                this._dragTargetStartY
                    + pointerY
                    - this._dragPointerStartY
            );
        }

        this._finishDrag(
            pointerX,
            pointerY
        );

        this._clearDrag();

        if (this._editMode && this._editHistory) {
            this._editHistory.record(
                this._captureEditState()
            );
        }

        this._lastRenderState = null;
        this._tick(true);
        this._schedulePositionRefresh();
    }


    _onDragMotion(event) {
        if (
            !this._dragging
            || !this._dragTarget
        ) {
            return Clutter.EVENT_PROPAGATE;
        }

        const [pointerX, pointerY] =
            event.get_coords();

        if (
            !(
                event.get_state()
                & Clutter.ModifierType.BUTTON1_MASK
            )
        ) {
            /*
             * Keep the last valid position rather than snapping to a
             * later unpressed pointer coordinate.
             */
            this._completeDrag();

            return Clutter.EVENT_STOP;
        }

        this._setDraggedPosition(
            this._dragTargetStartX
                + pointerX
                - this._dragPointerStartX,

            this._dragTargetStartY
                + pointerY
                - this._dragPointerStartY
        );

        return Clutter.EVENT_STOP;
    }


    _onDragRelease(event) {
        if (
            !this._dragging
            || !this._dragTarget
        ) {
            return Clutter.EVENT_PROPAGATE;
        }

        if (
            event.get_button()
            !== Clutter.BUTTON_PRIMARY
        ) {
            return Clutter.EVENT_STOP;
        }

        const [pointerX, pointerY] =
            event.get_coords();

        /*
         * A release can arrive without a final motion event. Apply its
         * coordinates before fitting and persisting the actor.
         */
        this._completeDrag(
            pointerX,
            pointerY,
            true
        );

        return Clutter.EVENT_STOP;
    }


    _setDraggedPosition(x, y) {
        if (!this._dragTarget)
            return;

        /*
         * Do not clamp during motion. This allows an actor to cross
         * monitor boundaries. It is fitted to the destination monitor
         * when the mouse button is released.
         */
        this._dragTarget.set_position(
            Math.round(x),
            Math.round(y)
        );

        if (this._dragKind === 'overlay')
            this._placeOverlayDragHandle();
    }


    _focusedMonitor() {
        const window =
            this._focusedGameWindow();

        if (window) {
            const monitorIndex =
                window.get_monitor?.();

            const monitor =
                Main.layoutManager
                    .monitors[monitorIndex];

            if (monitor) {
                this._lastGameMonitorIndex =
                    monitorIndex;

                return monitor;
            }
        }

        if (
            Number.isInteger(
                this._lastGameMonitorIndex
            )
        ) {
            const previousMonitor =
                Main.layoutManager
                    .monitors[
                        this._lastGameMonitorIndex
                    ];

            if (previousMonitor)
                return previousMonitor;
        }

        return (
            Main.layoutManager.primaryMonitor
            ?? null
        );
    }


    _readRawState() {
        if (!this._statePath)
            return null;


        try {
            const file =
                Gio.File.new_for_path(
                    this._statePath
                );

            const [ok, contents] =
                file.load_contents(null);

            if (!ok)
                return null;


            return new TextDecoder()
                .decode(contents);
        } catch {
            return null;
        }
    }


    _scheduleStateExpiry(delay) {
        if (this._stateExpiryId) {
            GLib.source_remove(
                this._stateExpiryId
            );

            this._stateExpiryId = null;
        }

        if (
            delay === null
            || delay <= 0
        ) {
            return;
        }

        this._stateExpiryId =
            GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                delay,
                () => {
                    this._stateExpiryId = null;
                    this._tick(false);
                    return GLib.SOURCE_REMOVE;
                }
            );
    }


    _tick(force) {
        if (!this._root)
            return;

        const gameWindow =
            this._focusedGameWindow();

        this._setUnredirectDisabled(
            gameWindow !== null
        );

        if (!gameWindow) {
            this._scheduleStateExpiry(null);
            this._root.hide();

            if (this._toolbar)
                this._toolbar.hide();

            return;
        }

        this._ensureGlobalOverlayPosition();

        const monitorIndex =
            gameWindow.get_monitor?.();

        if (Number.isInteger(monitorIndex)) {
            this._lastGameMonitorIndex =
                monitorIndex;
        }


        const raw =
            this._readRawState();

        const {
            state,
            expiryDelay,
        } = readState(raw);

        this._scheduleStateExpiry(
            expiryDelay
        );


        const overlayEnabled =
            this._settings.get_boolean(
                'overlay-enabled'
            );

        const speakingOnly =
            this._settings.get_boolean(
                'speaking-only'
            );

        const ringInside =
            this._settings.get_boolean(
                'ring-inside'
            );

        const avatarSize =
            this._settings.get_int(
                'avatar-size'
            );

        const nameMaxWidth =
            this._settings.get_int(
                'name-max-width'
            );

        const maxVisibleUsers =
            this._settings.get_int(
                'max-visible-users'
            );

        const anchorRight =
            this._settings.get_boolean(
                'anchor-right'
            );


        const users =
            Array.isArray(state.users)
                ? state.users.filter(
                    user =>
                        !speakingOnly
                        || Boolean(user.speaking)
                )
                : [];


        const renderState = [
            raw,
            state.connected,
            overlayEnabled,
            speakingOnly,
            ringInside,
            avatarSize,
            nameMaxWidth,
            maxVisibleUsers,
            anchorRight,
            this._editMode,
        ];

        const renderChanged =
            !this._lastRenderState
            || renderState.some(
                (value, index) =>
                    value
                    !== this._lastRenderState[index]
            );


        if (
            force
            || renderChanged
        ) {
            this._lastRenderState =
                renderState;

            const monitor =
                this._monitorForActor(
                    this._root
                )
                ?? this._focusedMonitor();

            this._userListRenderer?.render({
                users,
                stateConnected:
                    Boolean(state.connected),
                overlayEnabled,
                editMode: this._editMode,
                speakingOnly,
                ringInside,
                avatarSize,
                nameMaxWidth,
                maxVisibleUsers,
                anchorRight,
                monitor,
                overlayMargin:
                    OVERLAY_MARGIN,
            });
        }


        if (this._editMode) {
            this._root.show();
            this._toolbar.show();
            return;
        }

        this._toolbar.hide();

        const shouldShow =
            overlayEnabled
            && Boolean(state.connected)
            && users.length > 0;

        if (shouldShow)
            this._root.show();
        else
            this._root.hide();
    }
}
