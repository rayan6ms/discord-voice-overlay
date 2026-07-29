// SPDX-License-Identifier: GPL-3.0-or-later

export const STATE_PROTOCOL_VERSION = 2;
export const STATE_STALE_AFTER_MS = 45_000;

const STATE_FUTURE_TOLERANCE_MS = 5_000;


export function emptyState() {
    return {
        connected: false,
        channel: null,
        users: [],
    };
}


export function stateTimestampIsFresh(
    publishedAt,
    now = Date.now()
) {
    if (
        typeof publishedAt !== 'number'
        || !Number.isFinite(publishedAt)
    ) {
        return false;
    }

    const age = now - publishedAt;

    return (
        age >= -STATE_FUTURE_TOLERANCE_MS
        && age <= STATE_STALE_AFTER_MS
    );
}


export function stateExpiryDelay(
    raw,
    now = Date.now()
) {
    if (!raw)
        return null;

    try {
        const parsed = JSON.parse(raw);

        if (
            !parsed
            || typeof parsed !== 'object'
            || Array.isArray(parsed)
            || parsed.version !== STATE_PROTOCOL_VERSION
            || typeof parsed.publishedAt !== 'number'
            || !Number.isFinite(parsed.publishedAt)
        ) {
            return null;
        }

        const age = now - parsed.publishedAt;

        if (age < -STATE_FUTURE_TOLERANCE_MS)
            return null;

        return Math.max(
            0,
            STATE_STALE_AFTER_MS - age + 1
        );
    } catch {
        return null;
    }
}


export function parseState(raw, now = Date.now()) {
    if (!raw)
        return emptyState();

    try {
        const parsed = JSON.parse(raw);

        if (
            !parsed
            || typeof parsed !== 'object'
            || Array.isArray(parsed)
            || parsed.version !== STATE_PROTOCOL_VERSION
            || !stateTimestampIsFresh(
                parsed.publishedAt,
                now
            )
        ) {
            return emptyState();
        }

        return {
            connected: Boolean(parsed.connected),
            channel:
                parsed.channel
                && typeof parsed.channel === 'object'
                && !Array.isArray(parsed.channel)
                    ? parsed.channel
                    : null,
            users:
                Array.isArray(parsed.users)
                    ? parsed.users.filter(
                        user =>
                            user
                            && typeof user === 'object'
                            && !Array.isArray(user)
                    )
                    : [],
        };
    } catch {
        return emptyState();
    }
}
