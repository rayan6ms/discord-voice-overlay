/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 rayan6ms
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { chmod, mkdir, rename, rm, writeFile } from "fs/promises";
import { join } from "path";

function getPaths() {
    const runtimeDir = process.env.XDG_RUNTIME_DIR;

    if (!runtimeDir)
        throw new Error("XDG_RUNTIME_DIR is not set");

    const directory = join(runtimeDir, "discord-voice-overlay");

    return {
        directory,
        stateFile: join(directory, "state.json"),
        temporaryFile: join(directory, "state.json.tmp")
    };
}

export async function writeState(_: unknown, json: string) {
    const { directory, stateFile, temporaryFile } = getPaths();

    await mkdir(directory, {
        recursive: true,
        mode: 0o700
    });

    await chmod(directory, 0o700);

    /*
     * Write atomically so GNOME never sees half-written JSON.
     */
    await writeFile(temporaryFile, json, {
        encoding: "utf8",
        mode: 0o600
    });

    await chmod(temporaryFile, 0o600);
    await rename(temporaryFile, stateFile);
}

export async function clearState(_: unknown) {
    const { stateFile, temporaryFile } = getPaths();

    await Promise.allSettled([
        rm(stateFile, { force: true }),
        rm(temporaryFile, { force: true })
    ]);
}
