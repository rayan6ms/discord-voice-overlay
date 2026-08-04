// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {
    overlayPlaceholderText,
    userRowKey,
    userVisualOpacity,
    visibleUserLayout,
} from './render-model.js';

const USER_ACTIVITY_FADE_MS = 150;

function avatarCssUrl(value) {
    return String(value)
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

function createStatusIcon(gicon) {
    return new St.Icon({
        gicon,
        icon_size: 12,
        style_class: 'dvo-status-icon',
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
    statusIcons,
    editMode
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
        style_class: 'dvo-user-row',
        vertical: false,
        x_expand: true,
        x_align: Clutter.ActorAlign.FILL,
        reactive: false,
        can_focus: false,
        height: rowHeight,
    });

    let avatarContainer;
    let insideRing = null;
    let avatarFrame = null;

    if (ringInside) {
        const avatarStack = new St.Widget({
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

        insideRing =
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
            });

        avatarStack.add_child(insideRing);

        avatarContainer = avatarStack;
    } else {
        avatarFrame =
            new St.Bin({
                style_class:
                    'dvo-avatar-frame',

                reactive: false,
                can_focus: false,
                x_align:
                    Clutter.ActorAlign.CENTER,
                y_align:
                    Clutter.ActorAlign.CENTER,
            });

        avatarFrame.set_child(
            avatarActor(
                user.avatar,
                avatarSize
            )
        );

        avatarContainer = avatarFrame;
    }

    const namePlate = new St.BoxLayout({
        style_class: 'dvo-name-plate',
        vertical: false,
        reactive: false,
        can_focus: false,
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

    const liveBadge =
        new St.Label({
            text: 'LIVE',
            style_class: 'dvo-live-badge',
            reactive: false,
            can_focus: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

    decorations.push(liveBadge);

    let mutedIcon = null;
    let deafenedIcon = null;

    if (!speakingOnly) {
        if (statusIcons?.muted) {
            mutedIcon =
                createStatusIcon(
                    statusIcons.muted
                );

            decorations.push(mutedIcon);
        }

        if (statusIcons?.deafened) {
            deafenedIcon =
                createStatusIcon(
                    statusIcons.deafened
                );

            decorations.push(deafenedIcon);
        }
    }

    // Keep the name beside the avatar in either orientation.
    if (anchorRight) {
        // The spacer aligns every avatar to the widest row's right edge.
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

    let lastLive = null;
    let lastMuted = null;
    let lastDeafened = null;
    let lastVisuallyActive = null;

    const update = (
        currentUser,
        forceVisible = false
    ) => {
        const speaking =
            Boolean(currentUser.speaking);

        const visuallyActive =
            speaking || forceVisible;

        const visualOpacity =
            userVisualOpacity(
                visuallyActive
            );

        const live =
            Boolean(
                currentUser.live
                ?? currentUser.streaming
            );

        const muted =
            Boolean(
                mutedIcon
                && currentUser.muted
            );

        const deafened =
            Boolean(
                deafenedIcon
                && currentUser.deafened
            );

        const sizeChanged =
            lastLive !== null
            && (
                live !== lastLive
                || muted !== lastMuted
                || deafened !== lastDeafened
            );

        if (insideRing)
            insideRing.visible = speaking;

        if (avatarFrame) {
            avatarFrame.set_style_class_name(
                speaking
                    ? 'dvo-avatar-frame dvo-avatar-frame-speaking'
                    : 'dvo-avatar-frame'
            );
        }

        if (lastVisuallyActive === null) {
            row.opacity =
                visualOpacity;
        } else if (
            visuallyActive
            !== lastVisuallyActive
        ) {
            row.remove_all_transitions();
            row.ease({
                opacity: visualOpacity,
                duration:
                    USER_ACTIVITY_FADE_MS,
                mode:
                    Clutter.AnimationMode
                        .EASE_OUT_QUAD,
            });
        }

        liveBadge.visible = live;

        if (mutedIcon)
            mutedIcon.visible = muted;

        if (deafenedIcon)
            deafenedIcon.visible = deafened;

        lastLive = live;
        lastMuted = muted;
        lastDeafened = deafened;
        lastVisuallyActive =
            visuallyActive;

        return sizeChanged;
    };

    update(user, editMode);

    return {
        actor: row,
        update,
    };
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
        // Shell may dispose chrome actors before disable() during shutdown.
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
            let sizeChanged =
                this._destroyRowsExcept(
                    new Set()
                );

            if (this._overflowRow)
                sizeChanged = true;

            this._destroyOverflow();

            sizeChanged =
                this._updatePlaceholder(
                    overlayPlaceholderText({
                        overlayEnabled,
                        editMode,
                        stateConnected,
                        speakingOnly,
                        userCount: 0,
                    }),
                    0
                )
                || sizeChanged;

            if (sizeChanged)
                this._onSizeChanged?.();

            return;
        }

        let sizeChanged = false;

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
                    cached.row.actor.destroy();

                sizeChanged = true;

                cached = {
                    key,
                    row:
                        createUserRow(
                            user,
                            avatarSize,
                            speakingOnly,
                            ringInside,
                            nameMaxWidth,
                            anchorRight,
                            this._statusIcons,
                            editMode
                        ),
                };

                this._rows.set(
                    cacheId,
                    cached
                );
            }

            sizeChanged =
                cached.row.update(
                    user,
                    editMode
                )
                || sizeChanged;

            retainedRows.add(cacheId);
            desiredActors.push(
                cached.row.actor
            );
        }

        sizeChanged =
            this._destroyRowsExcept(
                retainedRows
            )
            || sizeChanged;

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
            const overflowText =
                `+${hiddenCount} more`;

            if (
                !this._overflowRow
                || this._overflowAnchorRight
                    !== anchorRight
                || this._overflowLabel?.text
                    !== overflowText
            ) {
                sizeChanged = true;
            }

            this._ensureOverflow(
                anchorRight
            );

            this._overflowLabel.set_style_class_name(
                anchorRight
                    ? 'dvo-overflow dvo-overflow-right'
                    : 'dvo-overflow'
            );

            this._overflowLabel.text =
                overflowText;

            this._placeActor(
                this._overflowRow,
                desiredActors.length
            );
        } else {
            if (this._overflowRow)
                sizeChanged = true;

            this._destroyOverflow();
        }

        sizeChanged =
            this._updatePlaceholder(
                overlayPlaceholderText({
                    overlayEnabled,
                    editMode,
                    stateConnected,
                    speakingOnly,
                    userCount: users.length,
                }),
                desiredActors.length
            )
            || sizeChanged;

        if (sizeChanged)
            this._onSizeChanged?.();
    }

    _updatePlaceholder(text, index) {
        if (!text) {
            if (!this._placeholder)
                return false;

            this._placeholder.destroy();
            this._placeholder = null;
            return true;
        }

        let changed = false;

        if (!this._placeholder) {
            this._placeholder =
                new St.Label({
                    style_class: 'dvo-placeholder',
                    reactive: false,
                });

            changed = true;
        }

        if (this._placeholder.text !== text) {
            this._placeholder.text = text;
            changed = true;
        }

        this._placeActor(
            this._placeholder,
            index
        );

        return changed;
    }

    _destroyRowsExcept(retainedRows) {
        let changed = false;

        for (const [id, cached] of this._rows) {
            if (retainedRows.has(id))
                continue;

            cached.row.actor.destroy();
            this._rows.delete(id);
            changed = true;
        }

        return changed;
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
