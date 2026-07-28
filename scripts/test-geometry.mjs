#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleUrl = new URL(
    "../gnome-extension/discord-voice-overlay@rayan6ms.github.io/geometry.js",
    import.meta.url
);

const source = await readFile(moduleUrl, "utf8");
const encoded = Buffer.from(source).toString("base64");

const {
    actorShouldAnchorRight,
    fitRectToMonitor,
    monitorForPoint
} = await import(`data:text/javascript;base64,${encoded}`);

const left = {
    x: 0,
    y: 0,
    width: 1000,
    height: 800
};

const right = {
    x: 1100,
    y: 100,
    width: 1200,
    height: 900
};

assert.equal(
    monitorForPoint(
        [left, right],
        left,
        400,
        300
    ),
    left
);

assert.equal(
    monitorForPoint(
        [left, right],
        left,
        1500,
        400
    ),
    right
);

assert.equal(
    monitorForPoint(
        [left, right],
        left,
        1075,
        400
    ),
    right
);

assert.deepEqual(
    fitRectToMonitor(
        200,
        100,
        left,
        -50,
        900,
        8
    ),
    [8, 692]
);

assert.deepEqual(
    fitRectToMonitor(
        1200,
        900,
        left,
        300,
        300,
        8
    ),
    [8, 8]
);

assert.equal(
    actorShouldAnchorRight(
        700,
        200,
        left
    ),
    true
);

assert.equal(
    actorShouldAnchorRight(
        300,
        200,
        left
    ),
    false
);

console.log("Overlay geometry tests passed.");
