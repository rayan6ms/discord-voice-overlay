// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const FALLBACK_INTERVAL_MS = 1_000;

function fileMatches(left, right) {
    try {
        return Boolean(
            left
            && right
            && left.equal(right)
        );
    } catch {
        return false;
    }
}

export class StateMonitor {
    constructor(statePath, onChange) {
        this._stateFile =
            Gio.File.new_for_path(statePath);

        this._directory =
            this._stateFile.get_parent();

        this._onChange = onChange;
        this._monitor = null;
        this._monitorSignalId = null;
        this._pendingId = null;
        this._fallbackId = null;
    }

    start() {
        if (this._monitor || this._fallbackId)
            return;

        try {
            const directoryPath =
                this._directory.get_path();

            if (
                !directoryPath
                || GLib.mkdir_with_parents(
                    directoryPath,
                    0o700
                ) !== 0
            ) {
                throw new Error(
                    'Could not prepare the runtime state directory.'
                );
            }

            this._monitor =
                this._directory.monitor_directory(
                    Gio.FileMonitorFlags.WATCH_MOVES,
                    null
                );

            this._monitor.set_rate_limit(0);

            this._monitorSignalId =
                this._monitor.connect(
                    'changed',
                    (
                        _monitor,
                        file,
                        otherFile
                    ) => {
                        if (
                            fileMatches(
                                file,
                                this._stateFile
                            )
                            || fileMatches(
                                otherFile,
                                this._stateFile
                            )
                        ) {
                            this._queueChange();
                        }
                    }
                );
        } catch (error) {
            console.error(
                '[DiscordVoiceOverlay] Could not monitor voice state; '
                + 'using a low-frequency fallback:',
                error
            );

            this._startFallback();
        }
    }

    stop() {
        if (this._pendingId) {
            GLib.source_remove(this._pendingId);
            this._pendingId = null;
        }

        if (this._fallbackId) {
            GLib.source_remove(this._fallbackId);
            this._fallbackId = null;
        }

        if (
            this._monitor
            && this._monitorSignalId
        ) {
            this._monitor.disconnect(
                this._monitorSignalId
            );
        }

        this._monitorSignalId = null;

        if (this._monitor)
            this._monitor.cancel();

        this._monitor = null;
    }

    _queueChange() {
        if (this._pendingId)
            return;

        this._pendingId =
            GLib.idle_add(
                GLib.PRIORITY_DEFAULT_IDLE,
                () => {
                    this._pendingId = null;
                    this._onChange();
                    return GLib.SOURCE_REMOVE;
                }
            );
    }

    _startFallback() {
        if (this._fallbackId)
            return;

        this._fallbackId =
            GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                FALLBACK_INTERVAL_MS,
                () => {
                    this._onChange();
                    return GLib.SOURCE_CONTINUE;
                }
            );
    }
}
