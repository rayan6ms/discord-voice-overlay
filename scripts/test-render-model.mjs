#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict';
import {
    userRowKey,
    visibleUserLayout,
} from '../gnome-extension/discord-voice-overlay@rayan6ms.github.io/render-model.js';


const users = Array.from(
    {length: 10},
    (_value, index) => ({
        id: String(index),
        name: `User ${index}`,
        speaking: false,
    })
);

const rowOptions = {
    avatarSize: 28,
    speakingOnly: false,
    ringInside: false,
    nameMaxWidth: 180,
    anchorRight: false,
};

assert.equal(
    userRowKey(users[0], rowOptions),
    userRowKey({...users[0]}, rowOptions),
    'equivalent rows should reuse the same actor'
);

assert.notEqual(
    userRowKey(users[0], rowOptions),
    userRowKey(
        {
            ...users[0],
            speaking: true,
        },
        rowOptions
    ),
    'a speaking change must invalidate only that user row'
);

assert.deepEqual(
    visibleUserLayout(
        users,
        {
            avatarSize: 28,
            ringInside: false,
            maxVisibleUsers: 8,
            monitorHeight: null,
            overlayMargin: 8,
        }
    ),
    {
        visibleUsers: users.slice(0, 7),
        hiddenCount: 3,
    },
    'the overflow label occupies one configured row'
);

const constrained =
    visibleUserLayout(
        users,
        {
            avatarSize: 64,
            ringInside: false,
            maxVisibleUsers: 10,
            monitorHeight: 240,
            overlayMargin: 8,
        }
    );

assert.equal(
    constrained.visibleUsers.length,
    1,
    'small monitors must reserve room for overflow'
);

assert.equal(
    constrained.hiddenCount,
    9
);

console.log('Render model tests passed.');
