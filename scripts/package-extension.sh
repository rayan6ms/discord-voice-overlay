#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)
UUID='discord-voice-overlay@rayan6ms.github.io'
SOURCE_DIR="$PROJECT_DIR/gnome-extension/$UUID"
OUTPUT_DIR=${1:-"$PROJECT_DIR/dist"}
RELEASE_TAG=${2:-v1.0.0}
TEMP_DIR=''

case "$RELEASE_TAG" in
    v[0-9]*.[0-9]*.[0-9]*) ;;
    *)
        printf 'Release tag must look like v1.0.0: %s\n' "$RELEASE_TAG" >&2
        exit 2
        ;;
esac

cleanup() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf -- "$TEMP_DIR"
    fi
}
trap cleanup EXIT HUP INT TERM

for command in python3 unzip zip; do
    if ! command -v "$command" >/dev/null 2>&1; then
        printf 'Required packaging command not found: %s\n' "$command" >&2
        exit 1
    fi
done

if [ ! -f "$SOURCE_DIR/metadata.json" ] || [ ! -f "$SOURCE_DIR/extension.js" ]; then
    printf 'Extension source is incomplete: %s\n' "$SOURCE_DIR" >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"
TEMP_DIR=$(mktemp -d)
STAGING_DIR="$TEMP_DIR/$UUID"
cp -R "$SOURCE_DIR" "$STAGING_DIR"
cp "$PROJECT_DIR/LICENSE" "$STAGING_DIR/COPYING"
find "$STAGING_DIR" -name gschemas.compiled -type f -delete
find "$STAGING_DIR" -type f -exec touch -t 200001010000 {} +

PACKED_ARCHIVE="$TEMP_DIR/$UUID.shell-extension.zip"
if command -v gnome-extensions >/dev/null 2>&1; then
    (
        cd "$STAGING_DIR"
        gnome-extensions pack \
            --force \
            --out-dir "$TEMP_DIR" \
            .
        zip -X -q "$PACKED_ARCHIVE" \
            COPYING \
            icons/headphones-deafened-symbolic.svg \
            icons/microphone-muted-symbolic.svg
    )
else
    printf 'gnome-extensions not found; using deterministic ZIP fallback.\n'
    (
        cd "$STAGING_DIR"
        zip -X -q -r "$PACKED_ARCHIVE" .
    )
fi

if [ ! -f "$PACKED_ARCHIVE" ]; then
    printf 'Extension packaging did not create an archive.\n' >&2
    exit 1
fi

ASSET_NAME="discord-voice-overlay-gnome-$RELEASE_TAG.zip"
OUTPUT_ARCHIVE="$OUTPUT_DIR/$ASSET_NAME"
cp "$PACKED_ARCHIVE" "$OUTPUT_ARCHIVE"

python3 - "$OUTPUT_ARCHIVE" "$UUID" <<'PY'
import io
import json
from pathlib import PurePosixPath
import sys
import zipfile

archive, expected_uuid = sys.argv[1:]
required = {
    "extension.js",
    "COPYING",
    "metadata.json",
    "prefs.js",
    "stylesheet.css",
    "schemas/org.gnome.shell.extensions.discord-voice-overlay.gschema.xml",
    "icons/headphones-deafened-symbolic.svg",
    "icons/microphone-muted-symbolic.svg",
}

with zipfile.ZipFile(archive) as package:
    names = {name.rstrip("/") for name in package.namelist()}
    missing = sorted(required - names)
    if missing:
        raise SystemExit(f"extension archive is missing: {', '.join(missing)}")
    if "schemas/gschemas.compiled" in names:
        raise SystemExit("extension archive must not contain gschemas.compiled")
    if any(PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts for name in names):
        raise SystemExit("extension archive contains an unsafe path")
    metadata = json.load(io.TextIOWrapper(package.open("metadata.json"), encoding="utf-8"))
    if metadata.get("uuid") != expected_uuid:
        raise SystemExit("extension archive UUID does not match")
PY

printf 'Built and validated %s\n' "$OUTPUT_ARCHIVE"
