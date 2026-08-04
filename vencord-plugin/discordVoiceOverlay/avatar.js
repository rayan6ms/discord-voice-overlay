/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 rayan6ms
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Empty means use the local fallback instead of a generated default-avatar URL.
export function getAvatarUrl(user) {
    if (!user?.avatar)
        return "";

    try {
        if (typeof user.getAvatarURL === "function") {
            const url = user.getAvatarURL(undefined, 64, true);

            if (url)
                return String(url);
        }
    } catch {}

    const extension =
        String(user.avatar).startsWith("a_")
            ? "gif"
            : "png";

    return (
        "https://cdn.discordapp.com/avatars/"
        + `${user.id}/${user.avatar}.${extension}?size=64`
    );
}
