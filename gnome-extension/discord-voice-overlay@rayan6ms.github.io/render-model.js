// SPDX-License-Identifier: GPL-3.0-or-later

/*
 * Match Discord's pinned voice-widget treatment: keep idle avatars and
 * names at 30% opacity, then restore them fully while that user speaks.
 */
export const IDLE_USER_OPACITY = 77;
export const ACTIVE_USER_OPACITY = 255;


export function userVisualOpacity(active) {
    return active
        ? ACTIVE_USER_OPACITY
        : IDLE_USER_OPACITY;
}


export function userRowKey(
    user,
    {
        avatarSize,
        speakingOnly,
        ringInside,
        nameMaxWidth,
        anchorRight,
    }
) {
    return JSON.stringify([
        user.id,
        user.name,
        user.username,
        user.avatar,
        avatarSize,
        speakingOnly,
        ringInside,
        nameMaxWidth,
        anchorRight,
    ]);
}


export function visibleUserLayout(
    users,
    {
        avatarSize,
        ringInside,
        maxVisibleUsers,
        monitorHeight,
        overlayMargin,
    }
) {
    const avatarOuterSize =
        ringInside
            ? avatarSize
            : avatarSize + 6;

    const estimatedRowHeight =
        Math.max(
            avatarOuterSize,
            24
        ) + 4;

    const rowsByHeight =
        Number.isFinite(monitorHeight)
            ? Math.max(
                2,
                Math.floor(
                    (
                        monitorHeight
                        - overlayMargin * 2
                        - 28
                    )
                    / estimatedRowHeight
                )
            )
            : maxVisibleUsers;

    const preliminaryLimit =
        Math.min(
            maxVisibleUsers,
            rowsByHeight,
            users.length
        );

    const overflowNeeded =
        users.length
        > preliminaryLimit;

    const visibleLimit =
        overflowNeeded
            ? Math.max(
                1,
                Math.min(
                    preliminaryLimit,
                    rowsByHeight - 1
                )
            )
            : preliminaryLimit;

    const visibleUsers =
        users.slice(
            0,
            visibleLimit
        );

    return {
        visibleUsers,
        hiddenCount:
            Math.max(
                0,
                users.length
                - visibleUsers.length
            ),
    };
}
