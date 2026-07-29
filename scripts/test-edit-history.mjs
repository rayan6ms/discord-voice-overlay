// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict';
import {EditHistory} from '../gnome-extension/discord-voice-overlay@rayan6ms.github.io/edit-history.js';


const initial = {
    overlayEnabled: true,
    avatarSize: 28,
    positionX: 24,
};

const history = new EditHistory(initial, 2);

assert.equal(history.canUndo, false);
assert.equal(history.canRedo, false);
assert.deepEqual(history.initial(), initial);

assert.equal(
    history.record({
        ...initial,
        avatarSize: 30,
    }),
    true
);

assert.equal(
    history.record({
        ...initial,
        avatarSize: 30,
    }),
    false
);

history.record({
    ...initial,
    avatarSize: 30,
    positionX: 80,
});

assert.deepEqual(
    history.undo(),
    {
        ...initial,
        avatarSize: 30,
    }
);

assert.deepEqual(
    history.undo(),
    initial
);

assert.equal(history.undo(), null);

assert.deepEqual(
    history.redo(),
    {
        ...initial,
        avatarSize: 30,
    }
);

history.record({
    ...initial,
    avatarSize: 32,
});

assert.equal(
    history.canRedo,
    false,
    'a new edit must discard the redo branch'
);

const limited = new EditHistory(initial, 2);

limited.record({...initial, avatarSize: 30});
limited.record({...initial, avatarSize: 32});
limited.record({...initial, avatarSize: 34});

assert.deepEqual(
    limited.undo(),
    {...initial, avatarSize: 32}
);

assert.deepEqual(
    limited.undo(),
    {...initial, avatarSize: 30}
);

assert.equal(
    limited.undo(),
    null,
    'history must respect its configured limit'
);

const detachedInitial = history.initial();
detachedInitial.avatarSize = 64;

assert.equal(
    history.initial().avatarSize,
    28,
    'returned snapshots must not mutate stored history'
);

assert.throws(
    () => new EditHistory(null),
    TypeError
);

assert.throws(
    () => new EditHistory(initial, 0),
    RangeError
);

console.log('Edit history tests passed.');
