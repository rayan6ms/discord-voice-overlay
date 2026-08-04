#!/usr/bin/gjs -m
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {StateMonitor} from '../gnome-extension/discord-voice-overlay@rayan6ms.github.io/state-monitor.js';


const testDirectory =
    GLib.dir_make_tmp(
        'discord-voice-overlay-monitor-XXXXXX'
    );

const statePath =
    GLib.build_filenamev([
        testDirectory,
        'state.json',
    ]);

const temporaryPath =
    `${statePath}.tmp`;

const loop =
    GLib.MainLoop.new(null, false);

let failure = null;
let startedAt = 0;

const monitor =
    new StateMonitor(
        statePath,
        () => {
            try {
                const [ok, contents] =
                    GLib.file_get_contents(
                        statePath
                    );

                if (!ok)
                    return;

                const text =
                    new TextDecoder()
                        .decode(contents);

                if (text !== 'updated\n')
                    return;

                const latencyMs =
                    (
                        GLib.get_monotonic_time()
                        - startedAt
                    )
                    / 1_000;

                if (latencyMs >= 1_000) {
                    throw new Error(
                        `State monitor latency was ${latencyMs} ms.`
                    );
                }

                print(
                    `State monitor test passed (${latencyMs.toFixed(1)} ms).`
                );

                loop.quit();
            } catch (error) {
                failure = error;
                loop.quit();
            }
        }
    );

monitor.start();

GLib.timeout_add(
    GLib.PRIORITY_DEFAULT,
    50,
    () => {
        try {
            GLib.file_set_contents(
                temporaryPath,
                'updated\n'
            );

            startedAt =
                GLib.get_monotonic_time();

            Gio.File.new_for_path(
                temporaryPath
            ).move(
                Gio.File.new_for_path(
                    statePath
                ),
                Gio.FileCopyFlags.OVERWRITE,
                null,
                null
            );
        } catch (error) {
            failure = error;
            loop.quit();
        }

        return GLib.SOURCE_REMOVE;
    }
);

GLib.timeout_add(
    GLib.PRIORITY_DEFAULT,
    2_000,
    () => {
        failure ??=
            new Error(
                'State monitor did not observe the atomic replacement.'
            );

        loop.quit();
        return GLib.SOURCE_REMOVE;
    }
);

loop.run();
monitor.stop();

for (const path of [
    temporaryPath,
    statePath,
]) {
    try {
        GLib.unlink(path);
    } catch {
        // Expected after the temporary file is renamed.
    }
}

GLib.rmdir(testDirectory);

if (failure)
    throw failure;
