#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)
UUID='discord-voice-overlay@rayan6ms.github.io'
EXTENSION_DIR="$PROJECT_DIR/gnome-extension/$UUID"
METADATA="$EXTENSION_DIR/metadata.json"
SCHEMA="$EXTENSION_DIR/schemas/org.gnome.shell.extensions.discord-voice-overlay.gschema.xml"
VERSION_FILE="$PROJECT_DIR/VERSION"

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$1" >&2
        exit 1
    fi
}

require_command node
require_command python3
require_command rg
require_command gjs

node --check "$EXTENSION_DIR/extension.js"
node --check "$EXTENSION_DIR/edit-history.js"
node --check "$EXTENSION_DIR/geometry.js"
node --check "$EXTENSION_DIR/prefs.js"
node --check "$EXTENSION_DIR/render-model.js"
node --check "$EXTENSION_DIR/state.js"
node --check "$EXTENSION_DIR/state-monitor.js"
node --check "$EXTENSION_DIR/user-list.js"
node --check "$EXTENSION_DIR/window-identity.js"
node --check "$PROJECT_DIR/vencord-plugin/discordVoiceOverlay/avatar.js"
node "$SCRIPT_DIR/test-avatar.mjs"
node "$SCRIPT_DIR/test-geometry.mjs"
node "$SCRIPT_DIR/test-edit-history.mjs"
node "$SCRIPT_DIR/test-render-model.mjs"
node "$SCRIPT_DIR/test-state.mjs"
gjs -m "$SCRIPT_DIR/test-state-monitor.js"
python3 -m json.tool "$METADATA" >/dev/null

if command -v glib-compile-schemas >/dev/null 2>&1; then
    glib-compile-schemas --strict --dry-run "$EXTENSION_DIR/schemas"
else
    python3 - "$SCHEMA" <<'PY'
import sys
import xml.etree.ElementTree as ET
ET.parse(sys.argv[1])
PY
fi

for script in "$SCRIPT_DIR"/*.sh; do
    sh -n "$script"
done

python3 - "$METADATA" "$EXTENSION_DIR/extension.js" \
    "$EXTENSION_DIR/prefs.js" "$SCHEMA" "$EXTENSION_DIR" \
    "$EXTENSION_DIR/state.js" \
    "$PROJECT_DIR/vencord-plugin/discordVoiceOverlay/index.ts" \
    "$VERSION_FILE" <<'PY'
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

(
    metadata_path,
    extension_path,
    prefs_path,
    schema_path,
    extension_dir,
    state_path,
    plugin_path,
    version_path,
) = (
    map(Path, sys.argv[1:])
)
metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
extension = extension_path.read_text(encoding="utf-8")
prefs = prefs_path.read_text(encoding="utf-8")
state_module = state_path.read_text(encoding="utf-8")
plugin = plugin_path.read_text(encoding="utf-8")
project_version = version_path.read_text(encoding="utf-8").strip()
root = ET.parse(schema_path).getroot()

if not re.fullmatch(r"\d+\.\d+\.\d+", project_version):
    raise SystemExit(f"invalid VERSION: {project_version!r}")

required = {
    "uuid",
    "name",
    "description",
    "shell-version",
    "settings-schema",
    "version",
    "url",
}
missing = sorted(required - metadata.keys())
if missing:
    raise SystemExit(f"metadata.json is missing: {', '.join(missing)}")

if metadata["uuid"] != extension_dir.name:
    raise SystemExit("extension directory and metadata UUID do not match")

if metadata["uuid"] != "discord-voice-overlay@rayan6ms.github.io":
    raise SystemExit("unexpected public extension UUID")

if metadata["shell-version"] != ["50"]:
    raise SystemExit("only the tested GNOME Shell 50 release may be declared")

version = int(metadata["version"])
extension_match = re.search(r"const EXTENSION_VERSION = (\d+);", extension)
extension_protocol = re.search(
    r"const APPLICATION_PICKER_PROTOCOL_VERSION = (\d+);", extension
)
prefs_protocol = re.search(
    r"const APPLICATION_PICKER_PROTOCOL_VERSION = (\d+);", prefs
)

if not extension_match or int(extension_match.group(1)) != version:
    raise SystemExit("extension.js runtime version does not match metadata.json")

if not extension_protocol or not prefs_protocol:
    raise SystemExit("application-picker protocol constant is missing")

if extension_protocol.group(1) != prefs_protocol.group(1):
    raise SystemExit("application-picker protocol mismatch")

state_protocol = re.search(
    r"export const STATE_PROTOCOL_VERSION = (\d+);",
    state_module,
)
plugin_state_protocol = re.search(
    r"const STATE_PROTOCOL_VERSION = (\d+) as const;",
    plugin,
)

if not state_protocol or not plugin_state_protocol:
    raise SystemExit("state protocol constant is missing")

if state_protocol.group(1) != plugin_state_protocol.group(1):
    raise SystemExit("GNOME and Vencord state protocol versions do not match")

allowed_key = next(
    (
        key
        for key in root.iter("key")
        if key.attrib.get("name") == "allowed-wm-classes"
    ),
    None,
)
if allowed_key is None:
    raise SystemExit("allowed-wm-classes schema key is missing")

default = allowed_key.findtext("default", default="").strip()
if default != "[]":
    raise SystemExit(f"public allowlist default must be [], found {default!r}")

schema_keys = {
    key.attrib.get("name"): key
    for key in root.iter("key")
}
expected_edit_shortcuts = {
    "cancel-edit": "['Escape']",
    "undo-edit": "['<Control>z']",
    "redo-edit": "['<Control>y', '<Control><Shift>z']",
}
for key_name, expected_default in expected_edit_shortcuts.items():
    key = schema_keys.get(key_name)
    if key is None:
        raise SystemExit(f"edit shortcut key is missing: {key_name}")
    actual_default = key.findtext("default", default="").strip()
    if actual_default != expected_default:
        raise SystemExit(
            f"{key_name} default is {actual_default!r}, "
            f"expected {expected_default!r}"
        )

compiled = list(extension_dir.rglob("gschemas.compiled"))
if compiled:
    raise SystemExit("gschemas.compiled must not be stored in source")

print(f"Metadata/runtime version: {version}")
print(f"Project version: {project_version}")
print(f"State protocol version: {state_protocol.group(1)}")
print("Default allowlist: []")
PY

if rg -n --hidden -g '!.git/**' -g '!scripts/check.sh' \
    '/home/[^/[:space:]]+/|BEGIN [A-Z ]*PRIVATE KEY|github_pat_|gho_' \
    "$PROJECT_DIR"; then
    printf 'Private path or credential-like text found.\n' >&2
    exit 1
fi

if ! rg -q 'name: "rayan6ms"' \
    "$PROJECT_DIR/vencord-plugin/discordVoiceOverlay/index.ts"; then
    printf 'Vencord plugin author metadata is not public-ready.\n' >&2
    exit 1
fi

if command -v shellcheck >/dev/null 2>&1; then
    shellcheck "$SCRIPT_DIR"/*.sh
fi

if git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$PROJECT_DIR" diff --check
fi

printf 'Project checks passed.\n'
