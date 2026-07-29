#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)
DIST_DIR="$PROJECT_DIR/dist"
PROJECT_VERSION=$(sed -n '1p' "$PROJECT_DIR/VERSION")
RELEASE_TAG=${1:-"v$PROJECT_VERSION"}
PLUGIN_ASSET="discord-voice-overlay-vencord-plugin-$RELEASE_TAG.zip"
INSTALL_ASSET='install.sh'
TEMP_DIR=''

if \
    ! printf '%s\n' "$RELEASE_TAG" \
        | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'
then
    printf 'Release tag must look like v1.0.0: %s\n' "$RELEASE_TAG" >&2
    exit 2
fi

if [ "$RELEASE_TAG" != "v$PROJECT_VERSION" ]; then
    printf 'Release tag %s does not match VERSION (%s).\n' \
        "$RELEASE_TAG" "$PROJECT_VERSION" >&2
    exit 2
fi

cleanup() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf -- "$TEMP_DIR"
    fi
}
trap cleanup EXIT HUP INT TERM

for command in grep sha256sum zip; do
    if ! command -v "$command" >/dev/null 2>&1; then
        printf 'Required release command not found: %s\n' "$command" >&2
        exit 1
    fi
done

"$SCRIPT_DIR/check.sh"

if [ "$DIST_DIR" != "$PROJECT_DIR/dist" ]; then
    printf 'Refusing to clean an unexpected output directory.\n' >&2
    exit 1
fi
rm -rf -- "$DIST_DIR"
mkdir -p "$DIST_DIR"

"$SCRIPT_DIR/package-extension.sh" "$DIST_DIR" "$RELEASE_TAG"

TEMP_DIR=$(mktemp -d)
PLUGIN_DIR="$TEMP_DIR/discordVoiceOverlay"
mkdir -p "$PLUGIN_DIR"
cp "$PROJECT_DIR/vencord-plugin/discordVoiceOverlay/index.ts" "$PLUGIN_DIR/"
cp "$PROJECT_DIR/vencord-plugin/discordVoiceOverlay/native.ts" "$PLUGIN_DIR/"
cp "$PROJECT_DIR/LICENSE" "$PLUGIN_DIR/"

find "$TEMP_DIR" -exec touch -t 200001010000 {} +
(
    cd "$TEMP_DIR"
    zip -X -q -r "$DIST_DIR/$PLUGIN_ASSET" discordVoiceOverlay
)

sed "s/@RELEASE_TAG@/$RELEASE_TAG/g" \
    "$SCRIPT_DIR/install-release.sh" \
    > "$DIST_DIR/$INSTALL_ASSET"
chmod 0755 "$DIST_DIR/$INSTALL_ASSET"
touch -t 200001010000 "$DIST_DIR/$INSTALL_ASSET"

(
    cd "$DIST_DIR"
    sha256sum \
        "discord-voice-overlay-gnome-$RELEASE_TAG.zip" \
        "$PLUGIN_ASSET" \
        "$INSTALL_ASSET" > SHA256SUMS
    sha256sum -c SHA256SUMS
)

printf 'Release assets:\n'
find "$DIST_DIR" -maxdepth 1 -type f -printf '  %f\n' | sort
