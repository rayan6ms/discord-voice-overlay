#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict';
import {
    ACTIVE_USER_OPACITY,
    IDLE_USER_OPACITY,
    overlayPlaceholderText,
    userRowKey,
    userVisualOpacity,
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
    IDLE_USER_OPACITY,
    77,
    'idle users should render at approximately 30% opacity'
);

assert.equal(
    userVisualOpacity(false),
    IDLE_USER_OPACITY
);

assert.equal(
    userVisualOpacity(true),
    ACTIVE_USER_OPACITY
);

assert.equal(
    overlayPlaceholderText({
        overlayEnabled: true,
        editMode: true,
        stateConnected: true,
        speakingOnly: true,
        userCount: 0,
    }),
    'No one speaking',
    'speaking-only edit mode must retain a visible layout child'
);

assert.equal(
    overlayPlaceholderText({
        overlayEnabled: true,
        editMode: true,
        stateConnected: false,
        speakingOnly: true,
        userCount: 0,
    }),
    'Discord voice: disconnected'
);

assert.equal(
    overlayPlaceholderText({
        overlayEnabled: true,
        editMode: false,
        stateConnected: true,
        speakingOnly: true,
        userCount: 0,
    }),
    null,
    'empty-state guidance belongs only to edit mode'
);

assert.equal(
    overlayPlaceholderText({
        overlayEnabled: false,
        editMode: true,
        stateConnected: true,
        speakingOnly: false,
        userCount: 3,
    }),
    'Overlay hidden'
);

assert.equal(
    overlayPlaceholderText({
        overlayEnabled: true,
        editMode: true,
        stateConnected: true,
        speakingOnly: false,
        userCount: 0,
    }),
    'No voice users'
);

assert.equal(
    overlayPlaceholderText({
        overlayEnabled: true,
        editMode: true,
        stateConnected: true,
        speakingOnly: true,
        userCount: 1,
    }),
    null
);

assert.equal(
    userRowKey(users[0], rowOptions),
    userRowKey({...users[0]}, rowOptions),
    'equivalent rows should reuse the same actor'
);

assert.equal(
    userRowKey(users[0], rowOptions),
    userRowKey(
        {
            ...users[0],
            speaking: true,
        },
        rowOptions
    ),
    'speaking changes should update the existing row in place'
);

assert.notEqual(
    userRowKey(users[0], rowOptions),
    userRowKey(
        {
            ...users[0],
            avatar: 'https://example.com/new-avatar.png',
        },
        rowOptions
    ),
    'an avatar change must replace only that user row'
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
