/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 rayan6ms
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Return only custom avatar URLs.
 *
 * Discord's getAvatarURL() also returns a generated CDN URL when a user
 * has no avatar. GNOME Shell cannot report failures from CSS background
 * images, so those URLs could leave a transparent actor behind. An empty
 * value tells the extension to use its local, always-available fallback
 * icon instead.
 */
export function getAvatarUrl(user) {
    if (!user?.avatar)
        return "";

    try {
        if (typeof user.getAvatarURL === "function") {
            const url = user.getAvatarURL(undefined, 64, true);

            if (url)
                return String(url);
        }
    } catch {
        // Fall through to constructing the custom-avatar CDN URL.
    }

    const extension =
        String(user.avatar).startsWith("a_")
            ? "gif"
            : "png";

    return (
        "https://cdn.discordapp.com/avatars/"
        + `${user.id}/${user.avatar}.${extension}?size=64`
    );
}
