#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleUrl = new URL(
    "../gnome-extension/discord-voice-overlay@rayan6ms.github.io/state.js",
    import.meta.url
);

const source = await readFile(moduleUrl, "utf8");
const encoded = Buffer.from(source).toString("base64");

const {
    STATE_PROTOCOL_VERSION,
    STATE_STALE_AFTER_MS,
    parseState,
    readState,
    stateExpiryDelay
} = await import(`data:text/javascript;base64,${encoded}`);

const now = 2_000_000_000_000;

function state(overrides = {}) {
    return JSON.stringify({
        version: STATE_PROTOCOL_VERSION,
        publishedAt: now,
        connected: true,
        channel: {
            id: "voice",
            name: "Voice",
            guildId: "guild"
        },
        users: [
            {
                id: "user"
            }
        ],
        ...overrides
    });
}

assert.equal(parseState(state(), now).connected, true);
assert.equal(parseState(state(), now).users.length, 1);
assert.deepEqual(
    readState(state(), now),
    {
        state: {
            connected: true,
            channel: {
                id: "voice",
                name: "Voice",
                guildId: "guild"
            },
            users: [
                {
                    id: "user"
                }
            ]
        },
        expiryDelay: STATE_STALE_AFTER_MS + 1
    },
    "the runtime snapshot should parse state and expiry together"
);
assert.equal(
    stateExpiryDelay(state(), now),
    STATE_STALE_AFTER_MS + 1
);

assert.equal(
    stateExpiryDelay(
        state({
            publishedAt:
                now - STATE_STALE_AFTER_MS
        }),
        now
    ),
    1
);

assert.equal(
    stateExpiryDelay(
        state({
            publishedAt:
                now - STATE_STALE_AFTER_MS - 1
        }),
        now
    ),
    0
);

assert.equal(
    parseState(
        state({
            publishedAt:
                now - STATE_STALE_AFTER_MS
        }),
        now
    ).connected,
    true
);

assert.deepEqual(
    parseState(
        state({
            publishedAt:
                now - STATE_STALE_AFTER_MS - 1
        }),
        now
    ),
    {
        connected: false,
        channel: null,
        users: []
    }
);

assert.equal(
    parseState(
        state({
            publishedAt: now + 5_001
        }),
        now
    ).connected,
    false
);

assert.equal(
    parseState(
        state({
            version:
                STATE_PROTOCOL_VERSION - 1
        }),
        now
    ).connected,
    false
);

assert.equal(
    parseState("{not json", now).connected,
    false
);

assert.equal(
    stateExpiryDelay("{not json", now),
    null
);

console.log("State freshness tests passed.");
