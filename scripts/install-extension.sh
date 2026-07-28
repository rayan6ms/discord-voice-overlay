#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
UUID='discord-voice-overlay@rayan6ms.github.io'
LEGACY_UUID='discord-voice-overlay@local'
TEMP_DIR=''
INSTALL_CACHE=''

cleanup() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf -- "$TEMP_DIR"
    fi
    if [ -n "$INSTALL_CACHE" ] && [ -d "$INSTALL_CACHE" ]; then
        rm -rf -- "$INSTALL_CACHE"
    fi
}
trap cleanup EXIT HUP INT TERM

if ! command -v gnome-extensions >/dev/null 2>&1; then
    printf 'gnome-extensions is required. Install the GNOME Shell tools package.\n' >&2
    exit 1
fi

if [ "$#" -gt 1 ]; then
    printf 'Usage: %s [extension-archive.zip]\n' "$0" >&2
    exit 2
fi

if [ "$#" -eq 1 ]; then
    ARCHIVE=$1
else
    TEMP_DIR=$(mktemp -d)
    "$SCRIPT_DIR/package-extension.sh" "$TEMP_DIR" v1.0.0
    ARCHIVE="$TEMP_DIR/discord-voice-overlay-gnome-v1.0.0.zip"
fi

if [ ! -f "$ARCHIVE" ]; then
    printf 'Extension archive not found: %s\n' "$ARCHIVE" >&2
    exit 1
fi

DATA_HOME=${XDG_DATA_HOME:-"$HOME/.local/share"}
mkdir -p "$DATA_HOME/gnome-shell"
INSTALL_CACHE=$(mktemp -d "$DATA_HOME/gnome-shell/.dvo-install-cache.XXXXXX")
XDG_CACHE_HOME="$INSTALL_CACHE" gnome-extensions install --force "$ARCHIVE"

printf 'Installed %s from %s\n' "$UUID" "$ARCHIVE"
printf 'Log out through the GNOME system menu and log back in to load the new code.\n'
printf 'Then enable it with:\n  gnome-extensions enable %s\n' "$UUID"

LEGACY_DIR="$DATA_HOME/gnome-shell/extensions/$LEGACY_UUID"
if [ -d "$LEGACY_DIR" ]; then
    printf '\nA pre-release installation using %s still exists.\n' "$LEGACY_UUID"
    printf 'Disable and remove it after confirming this release works; see README.md.\n'
fi
