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
    alignedDragHandleX,
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

assert.equal(
    actorShouldAnchorRight(
        400,
        200,
        left
    ),
    false,
    'the exact midpoint remains left-anchored'
);

assert.equal(
    actorShouldAnchorRight(
        401,
        200,
        left
    ),
    true,
    'orientation changes immediately after crossing the midpoint'
);

assert.equal(
    alignedDragHandleX(
        250,
        40,
        110,
        false
    ),
    250,
    'an empty left-anchored overlay keeps the handle on its left edge'
);

assert.equal(
    alignedDragHandleX(
        710,
        40,
        110,
        true
    ),
    640,
    'an empty right-anchored overlay keeps the handle on its right edge'
);

assert.equal(
    alignedDragHandleX(
        550,
        200,
        110,
        true
    ),
    640,
    'right-edge handle placement stays fixed when content width changes'
);

console.log("Overlay geometry tests passed.");
