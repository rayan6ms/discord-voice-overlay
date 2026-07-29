#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)
SOURCE_DIR="$PROJECT_DIR/vencord-plugin/discordVoiceOverlay"
INSTALL_TMP=''
BACKUP_DIR=''
ROLLBACK_NEEDED=false

cleanup() {
    if \
        [ "$ROLLBACK_NEEDED" = true ] \
        && [ -n "$BACKUP_DIR" ] \
        && [ -e "$BACKUP_DIR" ] \
        && [ ! -e "${TARGET_DIR:-}" ]
    then
        mv "$BACKUP_DIR" "$TARGET_DIR"
        printf 'Restored the previous plugin after the interrupted install.\n' >&2
    fi

    if [ -n "$INSTALL_TMP" ] && [ -d "$INSTALL_TMP" ]; then
        rm -rf -- "$INSTALL_TMP"
    fi
}
trap cleanup EXIT HUP INT TERM

find_vencord_dir() {
    if [ "$#" -eq 1 ]; then
        printf '%s\n' "$1"
        return
    fi

    if [ -n "${VENCORD_DIR:-}" ]; then
        printf '%s\n' "$VENCORD_DIR"
        return
    fi

    for candidate in \
        "$HOME/.local/src/Vencord" \
        "$HOME/Vencord" \
        "$HOME/Documents/Vencord"
    do
        if [ -f "$candidate/package.json" ] && [ -d "$candidate/src" ]; then
            printf '%s\n' "$candidate"
            return
        fi
    done

    return 1
}

if [ "$#" -gt 1 ]; then
    printf 'Usage: %s [Vencord checkout]\n' "$0" >&2
    exit 2
fi

if \
    [ ! -f "$SOURCE_DIR/index.ts" ] \
    || [ ! -f "$SOURCE_DIR/native.ts" ] \
    || [ ! -f "$SOURCE_DIR/avatar.js" ]
then
    printf 'Vencord plugin source is incomplete: %s\n' "$SOURCE_DIR" >&2
    exit 1
fi

if ! VENCORD_PATH=$(find_vencord_dir "$@"); then
    printf 'Could not find a Vencord source checkout.\n' >&2
    printf 'Pass its path or set VENCORD_DIR. See the official source-install guide.\n' >&2
    exit 1
fi

if [ ! -f "$VENCORD_PATH/package.json" ] || [ ! -d "$VENCORD_PATH/src" ]; then
    printf 'Not a Vencord source checkout: %s\n' "$VENCORD_PATH" >&2
    exit 1
fi

USER_PLUGINS="$VENCORD_PATH/src/userplugins"
TARGET_DIR="$USER_PLUGINS/discordVoiceOverlay"
mkdir -p "$USER_PLUGINS"
INSTALL_TMP=$(mktemp -d "$USER_PLUGINS/.discordVoiceOverlay.installing.XXXXXX")

cp "$SOURCE_DIR/index.ts" "$INSTALL_TMP/index.ts"
cp "$SOURCE_DIR/native.ts" "$INSTALL_TMP/native.ts"
cp "$SOURCE_DIR/avatar.js" "$INSTALL_TMP/avatar.js"

if [ -e "$TARGET_DIR" ]; then
    DATA_HOME=${XDG_DATA_HOME:-"$HOME/.local/share"}
    BACKUP_ROOT="$DATA_HOME/discord-voice-overlay/vencord-plugin-backups"
    mkdir -p "$BACKUP_ROOT"
    TIMESTAMP=$(date -u '+%Y%m%dT%H%M%SZ')
    BACKUP_DIR="$BACKUP_ROOT/discordVoiceOverlay-$TIMESTAMP-$$"
    mv "$TARGET_DIR" "$BACKUP_DIR"
    ROLLBACK_NEEDED=true
    printf 'Backed up the existing matching plugin to %s\n' "$BACKUP_DIR"
fi

if ! mv "$INSTALL_TMP" "$TARGET_DIR"; then
    printf 'Could not install the plugin source.\n' >&2
    exit 1
fi
INSTALL_TMP=''
ROLLBACK_NEEDED=false

printf 'Installed Vencord plugin source to %s\n' "$TARGET_DIR"
printf 'Next run: %s/build-vencord.sh %s\n' "$SCRIPT_DIR" "$VENCORD_PATH"
