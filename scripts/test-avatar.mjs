#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';


const moduleUrl = new URL(
    '../vencord-plugin/discordVoiceOverlay/avatar.js',
    import.meta.url
);

const source =
    await readFile(moduleUrl, 'utf8');

const encoded =
    Buffer.from(source).toString('base64');

const {getAvatarUrl} =
    await import(
        `data:text/javascript;base64,${encoded}`
    );


let defaultUrlCalls = 0;

assert.equal(
    getAvatarUrl({
        id: '1',
        avatar: null,
        getAvatarURL() {
            defaultUrlCalls += 1;
            return 'https://cdn.discordapp.com/embed/avatars/0.png';
        },
    }),
    '',
    'users without custom avatars should use the local fallback'
);

assert.equal(
    defaultUrlCalls,
    0,
    'default-avatar users should not require a CDN request'
);

assert.equal(
    getAvatarUrl({
        id: '2',
        avatar: 'custom',
        getAvatarURL() {
            return 'https://cdn.discordapp.com/avatars/2/custom.webp?size=64';
        },
    }),
    'https://cdn.discordapp.com/avatars/2/custom.webp?size=64'
);

assert.equal(
    getAvatarUrl({
        id: '3',
        avatar: 'a_animated',
        getAvatarURL() {
            throw new Error('Discord helper unavailable');
        },
    }),
    'https://cdn.discordapp.com/avatars/3/a_animated.gif?size=64',
    'animated custom avatars should retain a working fallback URL'
);

assert.equal(
    getAvatarUrl({
        id: '4',
        avatar: 'static',
    }),
    'https://cdn.discordapp.com/avatars/4/static.png?size=64'
);

console.log('Avatar bridge tests passed.');
