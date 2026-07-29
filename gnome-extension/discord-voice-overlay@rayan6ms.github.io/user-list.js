// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {
    userRowKey,
    visibleUserLayout,
} from './render-model.js';


function avatarCssUrl(value) {
    let uri = String(value);

    /*
     * This accepts the current Discord CDN URLs and also supports
     * ordinary local paths if the bridge later caches avatars.
     */
    if (!/^[a-z][a-z0-9+.-]*:/i.test(uri))
        uri = Gio.File.new_for_path(uri).get_uri();

    return uri
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\r\n]/g, '');
}


function avatarActor(url, avatarSize) {
    if (url) {
        try {
            const actor = new St.Bin({
                style_class: 'dvo-avatar-image',
                reactive: false,
                can_focus: false,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,

                /*
                 * Because this image is the actor's own themed
                 * background, St applies border-radius directly to
                 * the image instead of merely rounding a parent.
                 */
                style: `background-image: url("${avatarCssUrl(url)}");`,
            });

            actor.set_size(
                avatarSize,
                avatarSize
            );

            return actor;
        } catch (error) {
            console.error(
                '[DiscordVoiceOverlay] Avatar creation failed:',
                error
            );
        }
    }

    return new St.Icon({
        icon_name: 'avatar-default-symbolic',
        icon_size: avatarSize,
        style_class: 'dvo-avatar-fallback',
    });
}


function createStatusIcon(gicon, styleClass) {
    return new St.Icon({
        gicon,
        icon_size: 12,
        style_class: `dvo-status-icon ${styleClass}`,
        reactive: false,
        can_focus: false,
        y_align: Clutter.ActorAlign.CENTER,
    });
}


function cleanDisplayName(user) {
    const value =
        user?.name
        ?? user?.username
        ?? 'Unknown';

    const cleaned =
        String(value)
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

    return cleaned || 'Unknown';
}


function createUserRow(
    user,
    avatarSize,
    speakingOnly,
    ringInside,
    nameMaxWidth,
    anchorRight,
    statusIcons
) {
    const avatarOuterSize =
        ringInside
            ? avatarSize
            : avatarSize + 6;

    const namePlateHeight = 24;

    const rowHeight =
        Math.max(
            avatarOuterSize,
            namePlateHeight
        );

    const row = new St.BoxLayout({
        style_class:
            anchorRight
                ? 'dvo-user-row dvo-user-row-right'
                : 'dvo-user-row',

        vertical: false,
        x_expand: true,
        x_align: Clutter.ActorAlign.FILL,
        reactive: false,
        can_focus: false,
        height: rowHeight,
    });

    let avatarContainer;

    if (ringInside) {
        const avatarStack = new St.Widget({
            style_class: 'dvo-avatar-stack',
            layout_manager: new Clutter.BinLayout(),
            width: avatarSize,
            height: avatarSize,
            reactive: false,
            can_focus: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const avatar =
            avatarActor(
                user.avatar,
                avatarSize
            );

        avatar.x_align =
            Clutter.ActorAlign.CENTER;

        avatar.y_align =
            Clutter.ActorAlign.CENTER;

        avatarStack.add_child(avatar);

        if (user.speaking) {
            avatarStack.add_child(
                new St.Widget({
                    style_class:
                        'dvo-avatar-ring-inside',

                    width: avatarSize,
                    height: avatarSize,
                    reactive: false,
                    can_focus: false,
                    x_align:
                        Clutter.ActorAlign.CENTER,
                    y_align:
                        Clutter.ActorAlign.CENTER,
                })
            );
        }

        avatarContainer = avatarStack;
    } else {
        const avatarFrame = new St.Bin({
            style_class:
                user.speaking
                    ? 'dvo-avatar-frame dvo-avatar-frame-speaking'
                    : 'dvo-avatar-frame',

            reactive: false,
            can_focus: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        avatarFrame.set_child(
            avatarActor(
                user.avatar,
                avatarSize
            )
        );

        avatarContainer = avatarFrame;
    }

    let plateOpacity = 255;

    if (!user.speaking) {
        plateOpacity =
            user.muted || user.deafened
                ? 150
                : 185;
    }

    const namePlate = new St.BoxLayout({
        style_class: 'dvo-name-plate',
        vertical: false,
        reactive: false,
        can_focus: false,
        opacity: plateOpacity,
        height: namePlateHeight,
        y_align: Clutter.ActorAlign.CENTER,
    });

    const displayName =
        cleanDisplayName(user);

    const name = new St.Label({
        text: displayName,
        style_class: 'dvo-name',
        style: `max-width: ${nameMaxWidth}px;`,
        reactive: false,
        can_focus: false,
        y_align: Clutter.ActorAlign.CENTER,
    });

    name.set_accessible_name(displayName);

    name.clutter_text.set_single_line_mode(true);
    name.clutter_text.set_ellipsize(
        Pango.EllipsizeMode.END
    );

    name.clutter_text.set_line_alignment(
        anchorRight
            ? Pango.Alignment.RIGHT
            : Pango.Alignment.LEFT
    );

    const decorations = [];

    const userIsLive =
        Boolean(
            user.live
            ?? user.streaming
        );

    if (userIsLive) {
        decorations.push(
            new St.Label({
                text: 'LIVE',
                style_class: 'dvo-live-badge',
                reactive: false,
                can_focus: false,
                y_align: Clutter.ActorAlign.CENTER,
            })
        );
    }

    if (!speakingOnly) {
        if (user.muted && statusIcons?.muted) {
            decorations.push(
                createStatusIcon(
                    statusIcons.muted,
                    'dvo-status-muted'
                )
            );
        }

        if (user.deafened && statusIcons?.deafened) {
            decorations.push(
                createStatusIcon(
                    statusIcons.deafened,
                    'dvo-status-deafened'
                )
            );
        }
    }

    /*
     * Keep the name adjacent to the avatar in either orientation.
     *
     * Left side:
     *   avatar | name decorations
     *
     * Right side:
     *   decorations name | avatar
     */
    if (anchorRight) {
        /*
         * Every row is allocated to the width of the widest row. Let a
         * leading spacer absorb the difference so all avatars share the
         * same right edge regardless of display-name length.
         */
        row.add_child(
            new St.Widget({
                x_expand: true,
                reactive: false,
                can_focus: false,
            })
        );

        for (const decoration of decorations)
            namePlate.add_child(decoration);

        namePlate.add_child(name);

        row.add_child(namePlate);
        row.add_child(avatarContainer);
    } else {
        namePlate.add_child(name);

        for (const decoration of decorations)
            namePlate.add_child(decoration);

        row.add_child(avatarContainer);
        row.add_child(namePlate);

        row.add_child(
            new St.Widget({
                x_expand: true,
                reactive: false,
                can_focus: false,
            })
        );
    }

    return row;
}


export class UserListRenderer {
    constructor(
        container,
        statusIcons,
        onSizeChanged
    ) {
        this._container = container;
        this._statusIcons = statusIcons;
        this._onSizeChanged = onSizeChanged;
        this._rows = new Map();
        this._overflowRow = null;
        this._overflowLabel = null;
        this._overflowAnchorRight = null;
        this._placeholder = null;
    }


    destroy() {
        this._destroyRowsExcept(new Set());
        this._destroyOverflow();

        if (this._placeholder)
            this._placeholder.destroy();

        this._placeholder = null;
        this._container = null;
        this._statusIcons = null;
        this._onSizeChanged = null;
    }


    abandon() {
        /*
         * GNOME Shell may dispose chrome actors before disable() during
         * shutdown. Drop JavaScript references without touching disposed
         * GObjects in that lifecycle path.
         */
        this._rows.clear();
        this._overflowRow = null;
        this._overflowLabel = null;
        this._overflowAnchorRight = null;
        this._placeholder = null;
        this._container = null;
        this._statusIcons = null;
        this._onSizeChanged = null;
    }


    render({
        users,
        stateConnected,
        overlayEnabled,
        editMode,
        speakingOnly,
        ringInside,
        avatarSize,
        nameMaxWidth,
        maxVisibleUsers,
        anchorRight,
        monitor,
        overlayMargin,
    }) {
        if (!this._container)
            return;

        if (!overlayEnabled) {
            this._destroyRowsExcept(new Set());
            this._destroyOverflow();

            if (editMode) {
                this._placeholder ??=
                    new St.Label({
                        text: 'Overlay hidden',
                        style_class: 'dvo-placeholder',
                        reactive: false,
                    });

                this._placeActor(
                    this._placeholder,
                    0
                );
            } else if (this._placeholder) {
                this._placeholder.destroy();
                this._placeholder = null;
            }

            this._onSizeChanged?.();
            return;
        }

        if (this._placeholder) {
            this._placeholder.destroy();
            this._placeholder = null;
        }

        const {
            visibleUsers,
            hiddenCount,
        } = visibleUserLayout(
            users,
            {
                avatarSize,
                ringInside,
                maxVisibleUsers,
                monitorHeight:
                    monitor?.height,
                overlayMargin,
            }
        );

        const retainedRows = new Set();
        const desiredActors = [];

        for (
            let index = 0;
            index < visibleUsers.length;
            index += 1
        ) {
            const user = visibleUsers[index];
            const cacheId =
                String(
                    user.id
                    ?? `missing-${index}`
                );

            const key =
                userRowKey(
                    user,
                    {
                        avatarSize,
                        speakingOnly,
                        ringInside,
                        nameMaxWidth,
                        anchorRight,
                    }
                );

            let cached =
                this._rows.get(cacheId);

            if (!cached || cached.key !== key) {
                if (cached)
                    cached.actor.destroy();

                cached = {
                    key,
                    actor:
                        createUserRow(
                            user,
                            avatarSize,
                            speakingOnly,
                            ringInside,
                            nameMaxWidth,
                            anchorRight,
                            this._statusIcons
                        ),
                };

                this._rows.set(
                    cacheId,
                    cached
                );
            }

            retainedRows.add(cacheId);
            desiredActors.push(
                cached.actor
            );
        }

        this._destroyRowsExcept(
            retainedRows
        );

        for (
            let index = 0;
            index < desiredActors.length;
            index += 1
        ) {
            this._placeActor(
                desiredActors[index],
                index
            );
        }

        if (hiddenCount > 0) {
            this._ensureOverflow(
                anchorRight
            );

            this._overflowLabel.set_style_class_name(
                anchorRight
                    ? 'dvo-overflow dvo-overflow-right'
                    : 'dvo-overflow'
            );

            this._overflowLabel.text =
                `+${hiddenCount} more`;

            this._placeActor(
                this._overflowRow,
                desiredActors.length
            );
        } else {
            this._destroyOverflow();
        }

        if (
            users.length === 0
            && editMode
            && !(stateConnected && speakingOnly)
        ) {
            this._placeholder ??=
                new St.Label({
                    style_class: 'dvo-placeholder',
                    reactive: false,
                });

            this._placeholder.text =
                stateConnected
                    ? 'No voice users'
                    : 'Discord voice: disconnected';

            this._placeActor(
                this._placeholder,
                desiredActors.length
            );
        }

        this._onSizeChanged?.();
    }


    _destroyRowsExcept(retainedRows) {
        for (const [id, cached] of this._rows) {
            if (retainedRows.has(id))
                continue;

            cached.actor.destroy();
            this._rows.delete(id);
        }
    }


    _placeActor(actor, index) {
        if (actor.get_parent() !== this._container)
            this._container.add_child(actor);

        this._container.set_child_at_index(
            actor,
            index
        );
    }


    _ensureOverflow(anchorRight) {
        if (
            this._overflowRow
            && this._overflowAnchorRight
                === anchorRight
        ) {
            return;
        }

        this._destroyOverflow();

        this._overflowRow =
            new St.BoxLayout({
                vertical: false,
                x_expand: true,
                x_align:
                    Clutter.ActorAlign.FILL,
                reactive: false,
                can_focus: false,
            });

        this._overflowLabel =
            new St.Label({
                reactive: false,
                can_focus: false,
            });

        const spacer =
            new St.Widget({
                x_expand: true,
                reactive: false,
                can_focus: false,
            });

        if (anchorRight) {
            this._overflowRow.add_child(spacer);
            this._overflowRow.add_child(
                this._overflowLabel
            );
        } else {
            this._overflowRow.add_child(
                this._overflowLabel
            );
            this._overflowRow.add_child(spacer);
        }

        this._overflowAnchorRight =
            anchorRight;
    }


    _destroyOverflow() {
        if (this._overflowRow)
            this._overflowRow.destroy();

        this._overflowRow = null;
        this._overflowLabel = null;
        this._overflowAnchorRight = null;
    }
}
