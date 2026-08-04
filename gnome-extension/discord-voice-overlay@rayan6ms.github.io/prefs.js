// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SHELL_DBUS_NAME = 'org.gnome.Shell';

const APPLICATIONS_DBUS_PATH =
    '/org/gnome/Shell/Extensions/DiscordVoiceOverlay';

const APPLICATIONS_DBUS_INTERFACE =
    'org.gnome.Shell.Extensions.DiscordVoiceOverlay';

const APPLICATION_PICKER_PROTOCOL_VERSION = 2;
const APPLICATION_REFRESH_SECONDS = 5;

const APPLICATIONS_DBUS_XML = `
<node>
  <interface name="org.gnome.Shell.Extensions.DiscordVoiceOverlay">
    <method name="ListOpenApplications">
      <arg name="applicationsJson" type="s" direction="out"/>
    </method>
  </interface>
</node>`;

const ApplicationPickerProxy =
    Gio.DBusProxy.makeProxyWrapper(
        APPLICATIONS_DBUS_XML
    );

function normalizedIdentifiers(values) {
    if (!Array.isArray(values))
        return [];

    return [
        ...new Set(
            values
                .map(value => String(value).trim())
                .filter(value => value.length > 0)
        ),
    ].sort(
        (left, right) =>
            left.localeCompare(right)
    );
}

function applicationIcon(desktopId) {
    if (
        typeof desktopId !== 'string'
        || !desktopId.endsWith('.desktop')
    ) {
        return null;
    }

    try {
        return Gio.DesktopAppInfo
            .new(desktopId)
            ?.get_icon()
            ?? null;
    } catch {
        return null;
    }
}

function applicationSubtitle(application) {
    const identifiers =
        normalizedIdentifiers(
            application.identifiers ?? []
        );

    const title =
        Array.isArray(application.titles)
            ? application.titles.find(
                value =>
                    typeof value === 'string'
                    && value.trim().length > 0
            )
            : null;

    const identityText =
        identifiers.length === 1
            ? `${_('Identifier')}: ${identifiers[0]}`
            : `${_('Identifiers')}: ${identifiers.join(', ')}`;

    if (title)
        return `${title} — ${identityText}`;

    return identityText;
}

export default class DiscordVoiceOverlayPreferences
    extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings =
            this.getSettings();

        // Keep settings alive with the preferences window.
        window._settings = settings;
        window.set_default_size(720, 760);

        const page = new Adw.PreferencesPage({
            title: _('Discord Voice Overlay'),
            icon_name: 'audio-headset-symbolic',
        });

        window.add(page);

        const behaviorGroup = new Adw.PreferencesGroup({
            title: _('Behavior'),
            description:
                _('These settings also remain available in the in-game edit toolbar.'),
        });

        page.add(behaviorGroup);

        const overlayRow = new Adw.SwitchRow({
            title: _('Overlay enabled'),
            subtitle:
                _('Show the voice overlay over allowed applications.'),
        });

        behaviorGroup.add(overlayRow);

        settings.bind(
            'overlay-enabled',
            overlayRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const speakingRow = new Adw.SwitchRow({
            title: _('Speaking only'),
            subtitle:
                _('Hide users who are not currently speaking.'),
        });

        behaviorGroup.add(speakingRow);

        settings.bind(
            'speaking-only',
            speakingRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const ringRow = new Adw.SwitchRow({
            title: _('Speaking ring inside avatar'),
            subtitle:
                _('Reduce row size by drawing the green ring over the avatar edge.'),
        });

        behaviorGroup.add(ringRow);

        settings.bind(
            'ring-inside',
            ringRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const nameWidthAdjustment =
            new Gtk.Adjustment({
                lower: 80,
                upper: 320,
                step_increment: 10,
                page_increment: 20,
                value:
                    settings.get_int(
                        'name-max-width'
                    ),
            });

        const nameWidthRow = new Adw.SpinRow({
            title: _('Maximum name width'),
            subtitle:
                _('Longer names stay on one line and end with an ellipsis.'),
            adjustment: nameWidthAdjustment,
            digits: 0,
        });

        behaviorGroup.add(nameWidthRow);

        nameWidthRow.connect(
            'notify::value',
            () => {
                settings.set_int(
                    'name-max-width',
                    Math.round(nameWidthRow.value)
                );
            }
        );

        const maxUsersAdjustment =
            new Gtk.Adjustment({
                lower: 1,
                upper: 30,
                step_increment: 1,
                page_increment: 5,
                value:
                    settings.get_int(
                        'max-visible-users'
                    ),
            });

        const maxUsersRow = new Adw.SpinRow({
            title: _('Maximum visible users'),
            subtitle:
                _('Additional users are represented by a compact “+N more” row. People keep a stable order while they are in the channel.'),
            adjustment: maxUsersAdjustment,
            digits: 0,
        });

        behaviorGroup.add(maxUsersRow);

        maxUsersRow.connect(
            'notify::value',
            () => {
                settings.set_int(
                    'max-visible-users',
                    Math.round(maxUsersRow.value)
                );
            }
        );

        const edgeLayoutRow = new Adw.ActionRow({
            title: _('Automatic edge layout'),
            subtitle:
                _('On the right half of a monitor, avatars move to the right so names expand toward the centre. The controls palette and voice list can be dragged independently.'),
        });

        edgeLayoutRow.add_css_class('property');
        behaviorGroup.add(edgeLayoutRow);

        const shortcutGroup = new Adw.PreferencesGroup({
            title: _('Keyboard shortcut'),
        });

        page.add(shortcutGroup);

        const shortcutRow = new Adw.EntryRow({
            title: _('Edit-mode shortcut'),
            show_apply_button: true,
        });

        shortcutGroup.add(shortcutRow);

        const shortcutEffectDescription =
            _('Changes take effect immediately while an allowed application is focused.');

        const updateShortcutUi = () => {
            const shortcut =
                settings.get_strv(
                    'toggle-edit-mode'
                )[0]
                ?? '';

            if (shortcutRow.text !== shortcut)
                shortcutRow.text = shortcut;

            shortcutRow.remove_css_class('error');

            if (
                shortcut.length === 0
                || shortcut === 'disabled'
            ) {
                shortcutGroup.description =
                    `${_('Current shortcut: Disabled')} ${shortcutEffectDescription}`;

                return;
            }

            const [ok, keyval, modifiers] =
                Gtk.accelerator_parse(shortcut);

            const displayShortcut =
                ok
                    ? Gtk.accelerator_get_label(
                        keyval,
                        modifiers
                    )
                    : shortcut;

            shortcutGroup.description =
                `${_('Current shortcut')}: ${displayShortcut}. ${shortcutEffectDescription}`;
        };

        const saveShortcut = () => {
            const requested =
                shortcutRow.text.trim();

            if (requested.length === 0) {
                settings.set_strv(
                    'toggle-edit-mode',
                    []
                );

                updateShortcutUi();
                return;
            }

            const [ok, keyval, modifiers] =
                Gtk.accelerator_parse(requested);

            if (
                !ok
                || !Gtk.accelerator_valid(
                    keyval,
                    modifiers
                )
            ) {
                shortcutRow.add_css_class('error');
                shortcutGroup.description =
                    _('Invalid shortcut. Use a GTK accelerator such as <Control>comma or <Shift><Alt>F1.');

                return;
            }

            const canonical =
                Gtk.accelerator_name(
                    keyval,
                    modifiers
                );

            settings.set_strv(
                'toggle-edit-mode',
                [canonical]
            );

            updateShortcutUi();
        };

        shortcutRow.connect(
            'apply',
            saveShortcut
        );

        shortcutRow.connect(
            'entry-activated',
            saveShortcut
        );

        updateShortcutUi();

        const openApplicationsGroup =
            new Adw.PreferencesGroup({
                title: _('Open applications'),
                description:
                    _('Enable an application to show the overlay whenever one of its windows is focused. Changes take effect immediately.'),
            });

        page.add(openApplicationsGroup);

        const refreshButton = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            tooltip_text: _('Refresh open applications'),
            valign: Gtk.Align.CENTER,
        });

        refreshButton.add_css_class('flat');
        openApplicationsGroup.set_header_suffix(
            refreshButton
        );

        const applicationsStatusRow =
            new Adw.ActionRow({
                title: _('Loading open applications…'),
                subtitle:
                    _('The extension must be enabled for application detection.'),
            });

        openApplicationsGroup.add(
            applicationsStatusRow
        );

        const closedApplicationsGroup =
            new Adw.PreferencesGroup({
                title: _('Allowed but currently closed'),
                description:
                    _('These saved identifiers remain active even though no matching window is open right now.'),
                visible: false,
            });

        page.add(closedApplicationsGroup);

        const advancedGroup = new Adw.PreferencesGroup({
            title: _('Advanced identifiers'),
            description:
                _('Most users can use the application picker above. This field remains available for unusual windows that GNOME cannot associate with an application.'),
        });

        page.add(advancedGroup);

        const identifiersRow = new Adw.EntryRow({
            title: _('Exact window identifiers'),
            show_apply_button: true,
        });

        identifiersRow.text =
            settings
                .get_strv('allowed-wm-classes')
                .join(', ');

        advancedGroup.add(identifiersRow);

        const saveIdentifiers = () => {
            const identifiers =
                normalizedIdentifiers(
                    identifiersRow.text.split(',')
                );

            settings.set_strv(
                'allowed-wm-classes',
                identifiers
            );

            identifiersRow.text =
                identifiers.join(', ');
        };

        identifiersRow.connect(
            'apply',
            saveIdentifiers
        );

        identifiersRow.connect(
            'entry-activated',
            saveIdentifiers
        );

        let openApplicationRows = [];
        let closedApplicationRows = [];
        let lastApplications = [];
        let lastApplicationsKey = '';
        let refreshInFlight = false;
        let applicationPickerProxy = null;
        let preferencesClosed = false;
        let renderIdleId = 0;
        let refreshTimerId = 0;

        let pickerState = 'loading';
        let pickerDetail = '';
        let pickerTotalWindows = 0;
        let pickerEligibleWindows = 0;

        const clearRows = (group, rows) => {
            for (const row of rows)
                group.remove(row);

            rows.length = 0;
        };

        const renderApplications = () => {
            clearRows(
                openApplicationsGroup,
                openApplicationRows
            );

            clearRows(
                closedApplicationsGroup,
                closedApplicationRows
            );

            const allowed = new Set(
                settings.get_strv(
                    'allowed-wm-classes'
                )
            );

            const representedIdentifiers =
                new Set();

            for (const application of lastApplications) {
                const identifiers =
                    normalizedIdentifiers(
                        application.identifiers ?? []
                    );

                if (identifiers.length === 0)
                    continue;

                for (const identifier of identifiers)
                    representedIdentifiers.add(identifier);

                const row = new Adw.SwitchRow({
                    title:
                        String(
                            application.name
                            || identifiers[0]
                        ),

                    subtitle:
                        applicationSubtitle(application),

                    active:
                        identifiers.some(
                            identifier =>
                                allowed.has(identifier)
                        ),
                });

                const gicon =
                    applicationIcon(
                        application.desktopId
                    );

                if (gicon) {
                    row.add_prefix(
                        new Gtk.Image({
                            gicon,
                            pixel_size: 32,
                            valign: Gtk.Align.CENTER,
                        })
                    );
                }

                row.connect(
                    'notify::active',
                    () => {
                        const next = new Set(
                            settings.get_strv(
                                'allowed-wm-classes'
                            )
                        );

                        if (row.active) {
                            for (
                                const identifier
                                of identifiers
                            ) {
                                next.add(identifier);
                            }
                        } else {
                            for (
                                const identifier
                                of identifiers
                            ) {
                                next.delete(identifier);
                            }
                        }

                        settings.set_strv(
                            'allowed-wm-classes',
                            normalizedIdentifiers(
                                [...next]
                            )
                        );
                    }
                );

                openApplicationsGroup.add(row);
                openApplicationRows.push(row);
            }

            const closedIdentifiers =
                [...allowed]
                    .filter(
                        identifier =>
                            !representedIdentifiers
                                .has(identifier)
                    )
                    .sort(
                        (left, right) =>
                            left.localeCompare(right)
                    );

            closedApplicationsGroup.visible =
                closedIdentifiers.length > 0;

            for (
                const identifier
                of closedIdentifiers
            ) {
                const row = new Adw.ActionRow({
                    title: identifier,
                    subtitle:
                        _('Allowed identifier — no matching application is currently open.'),
                });

                const removeButton = new Gtk.Button({
                    icon_name: 'edit-delete-symbolic',
                    tooltip_text:
                        _('Remove from allowed applications'),
                    valign: Gtk.Align.CENTER,
                });

                removeButton.add_css_class('flat');
                removeButton.add_css_class(
                    'destructive-action'
                );

                removeButton.connect(
                    'clicked',
                    () => {
                        const next = new Set(
                            settings.get_strv(
                                'allowed-wm-classes'
                            )
                        );

                        next.delete(identifier);

                        settings.set_strv(
                            'allowed-wm-classes',
                            normalizedIdentifiers(
                                [...next]
                            )
                        );
                    }
                );

                row.add_suffix(removeButton);

                closedApplicationsGroup.add(row);
                closedApplicationRows.push(row);
            }

            applicationsStatusRow.visible =
                pickerState !== 'ready'
                || lastApplications.length === 0;

            if (pickerState === 'loading') {
                applicationsStatusRow.title =
                    _('Loading open applications…');

                applicationsStatusRow.subtitle =
                    _('Waiting for the running GNOME Shell extension.');
            } else if (pickerState === 'incompatible') {
                applicationsStatusRow.title =
                    _('Application picker needs an extension update');

                applicationsStatusRow.subtitle =
                    pickerDetail;
            } else if (pickerState === 'error') {
                applicationsStatusRow.title =
                    _('Application picker unavailable');

                applicationsStatusRow.subtitle =
                    pickerDetail;
            } else if (lastApplications.length === 0) {
                applicationsStatusRow.title =
                    _('No open applications detected');

                applicationsStatusRow.subtitle =
                    `${_('GNOME Shell reported')} ${pickerEligibleWindows} ${_('eligible windows out of')} ${pickerTotalWindows}. ${_('Open a program or game, then press Refresh.')}`;
            }
        };

        const scheduleRender = () => {
            if (
                preferencesClosed
                || renderIdleId
            ) {
                return;
            }

            renderIdleId = GLib.idle_add(
                GLib.PRIORITY_DEFAULT_IDLE,
                () => {
                    renderIdleId = 0;
                    renderApplications();
                    return GLib.SOURCE_REMOVE;
                }
            );
        };

        const getApplicationPickerProxy = async () => {
            if (applicationPickerProxy)
                return applicationPickerProxy;

            applicationPickerProxy =
                await new Promise(
                    (resolve, reject) => {
                        ApplicationPickerProxy(
                            Gio.DBus.session,
                            SHELL_DBUS_NAME,
                            APPLICATIONS_DBUS_PATH,
                            (proxy, error) => {
                                if (error)
                                    reject(error);
                                else
                                    resolve(proxy);
                            },
                            null,
                            Gio.DBusProxyFlags.NONE
                        );
                    }
                );

            return applicationPickerProxy;
        };

        const refreshApplications = async () => {
            if (
                preferencesClosed
                || refreshInFlight
            ) {
                return;
            }

            refreshInFlight = true;

            try {
                const proxy =
                    await getApplicationPickerProxy();

                const result =
                    await new Promise(
                        (resolve, reject) => {
                            proxy.ListOpenApplicationsRemote(
                                (
                                    returnValue,
                                    error
                                ) => {
                                    if (error)
                                        reject(error);
                                    else
                                        resolve(returnValue);
                                }
                            );
                        }
                    );

                const json =
                    Array.isArray(result)
                        ? result[0]
                        : result;

                const payload =
                    JSON.parse(json);

                const protocolVersion =
                    Number(payload?.protocolVersion);

                if (
                    protocolVersion
                    !== APPLICATION_PICKER_PROTOCOL_VERSION
                ) {
                    const previousState = pickerState;
                    const previousDetail = pickerDetail;

                    pickerState = 'incompatible';
                    pickerDetail =
                        _('Preferences and the running extension use incompatible application-picker protocols. Reinstall the same release, log out and back in, then reopen Preferences.');

                    lastApplications = [];
                    lastApplicationsKey = '';

                    if (
                        previousState !== pickerState
                        || previousDetail !== pickerDetail
                    ) {
                        scheduleRender();
                    }

                    return;
                }

                const applications =
                    Array.isArray(
                        payload?.applications
                    )
                        ? payload.applications.filter(
                            application =>
                                application
                                && typeof application
                                    === 'object'
                        )
                        : [];

                const key =
                    JSON.stringify(applications);

                const nextTotalWindows =
                    Number(payload?.totalWindowCount) || 0;

                const nextEligibleWindows =
                    Number(payload?.eligibleWindowCount) || 0;

                const stateChanged =
                    pickerState !== 'ready';

                const countsChanged =
                    pickerTotalWindows !== nextTotalWindows
                    || pickerEligibleWindows
                        !== nextEligibleWindows;

                pickerState = 'ready';
                pickerDetail = '';
                pickerTotalWindows = nextTotalWindows;
                pickerEligibleWindows = nextEligibleWindows;

                if (
                    key !== lastApplicationsKey
                    || stateChanged
                    || (
                        applications.length === 0
                        && countsChanged
                    )
                ) {
                    lastApplicationsKey = key;
                    lastApplications = applications;
                    scheduleRender();
                }
            } catch (error) {
                if (error instanceof Gio.DBusError)
                    Gio.DBusError.strip_remote_error(error);

                const previousState = pickerState;
                const previousDetail = pickerDetail;

                pickerState = 'error';
                pickerDetail =
                    _('Could not contact the application-picker service. Make sure the extension is enabled, then log out and back in after installing or updating it.');

                applicationPickerProxy = null;
                lastApplications = [];
                lastApplicationsKey = '';

                if (
                    previousState !== pickerState
                    || previousDetail !== pickerDetail
                ) {
                    scheduleRender();
                }
            } finally {
                refreshInFlight = false;
            }
        };

        refreshButton.connect(
            'clicked',
            () => void refreshApplications()
        );

        const settingsChangedId =
            settings.connect(
                'changed::allowed-wm-classes',
                () => {
                    const expected =
                        settings
                            .get_strv(
                                'allowed-wm-classes'
                            )
                            .join(', ');

                    if (identifiersRow.text !== expected)
                        identifiersRow.text = expected;

                    scheduleRender();
                }
            );

        const shortcutChangedId =
            settings.connect(
                'changed::toggle-edit-mode',
                updateShortcutUi
            );

        refreshTimerId =
            GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                APPLICATION_REFRESH_SECONDS,
                () => {
                    void refreshApplications();
                    return GLib.SOURCE_CONTINUE;
                }
            );

        window.connect(
            'close-request',
            () => {
                preferencesClosed = true;

                settings.disconnect(
                    settingsChangedId
                );

                settings.disconnect(
                    shortcutChangedId
                );

                if (renderIdleId) {
                    GLib.source_remove(
                        renderIdleId
                    );

                    renderIdleId = 0;
                }

                if (refreshTimerId) {
                    GLib.source_remove(
                        refreshTimerId
                    );

                    refreshTimerId = 0;
                }

                return false;
            }
        );

        void refreshApplications();
    }
}
