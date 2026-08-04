// SPDX-License-Identifier: GPL-3.0-or-later

function copySnapshot(snapshot) {
    return {...snapshot};
}

function snapshotsEqual(left, right) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length)
        return false;

    return leftKeys.every(
        key =>
            Object.hasOwn(right, key)
            && left[key] === right[key]
    );
}

export class EditHistory {
    constructor(initialSnapshot, limit = 100) {
        if (
            !initialSnapshot
            || typeof initialSnapshot !== 'object'
            || Array.isArray(initialSnapshot)
        ) {
            throw new TypeError(
                'An edit history requires a snapshot object.'
            );
        }

        if (!Number.isInteger(limit) || limit < 1) {
            throw new RangeError(
                'The edit history limit must be a positive integer.'
            );
        }

        this._initial =
            copySnapshot(initialSnapshot);

        this._current =
            copySnapshot(initialSnapshot);

        this._limit = limit;
        this._undoStack = [];
        this._redoStack = [];
    }

    get canUndo() {
        return this._undoStack.length > 0;
    }

    get canRedo() {
        return this._redoStack.length > 0;
    }

    initial() {
        return copySnapshot(this._initial);
    }

    record(snapshot) {
        if (snapshotsEqual(snapshot, this._current))
            return false;

        this._undoStack.push(
            copySnapshot(this._current)
        );

        if (this._undoStack.length > this._limit)
            this._undoStack.shift();

        this._current =
            copySnapshot(snapshot);

        this._redoStack.length = 0;
        return true;
    }

    undo() {
        if (!this.canUndo)
            return null;

        this._redoStack.push(
            copySnapshot(this._current)
        );

        this._current =
            this._undoStack.pop();

        return copySnapshot(this._current);
    }

    redo() {
        if (!this.canRedo)
            return null;

        this._undoStack.push(
            copySnapshot(this._current)
        );

        this._current =
            this._redoStack.pop();

        return copySnapshot(this._current);
    }
}
