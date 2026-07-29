// SPDX-License-Identifier: GPL-3.0-or-later

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
        Boolean(user.speaking),
        Boolean(user.live ?? user.streaming),
        Boolean(user.muted),
        Boolean(user.deafened),
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
