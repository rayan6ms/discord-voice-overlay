#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
set -eu

RELEASE_TAG=${DVO_VERSION:-@RELEASE_TAG@}
REPOSITORY='rayan6ms/discord-voice-overlay'
UUID='discord-voice-overlay@rayan6ms.github.io'
LEGACY_UUID='discord-voice-overlay@local'
VENCORD_PATH=${VENCORD_DIR:-"$HOME/.local/src/Vencord"}
TEMP_DIR=''
INSTALL_STAGE=''
INSTALL_CACHE=''

case "$RELEASE_TAG" in
    v[0-9]*.[0-9]*.[0-9]*) ;;
    *)
        printf 'Invalid release version: %s\n' "$RELEASE_TAG" >&2
        exit 2
        ;;
esac

cleanup() {
    if [ -n "$INSTALL_STAGE" ] && [ -d "$INSTALL_STAGE" ]; then
        rm -rf -- "$INSTALL_STAGE"
    fi
    if [ -n "$INSTALL_CACHE" ] && [ -d "$INSTALL_CACHE" ]; then
        rm -rf -- "$INSTALL_CACHE"
    fi
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf -- "$TEMP_DIR"
    fi
}
trap cleanup EXIT HUP INT TERM

for command in curl git gnome-extensions node pnpm sha256sum unzip; do
    if ! command -v "$command" >/dev/null 2>&1; then
        printf 'Missing required command: %s\n' "$command" >&2
        printf 'See the Requirements section in the project README.\n' >&2
        exit 1
    fi
done

DATA_HOME=${XDG_DATA_HOME:-"$HOME/.local/share"}
EXTENSION_DIR="$DATA_HOME/gnome-shell/extensions/$UUID"
LEGACY_DIR="$DATA_HOME/gnome-shell/extensions/$LEGACY_UUID"

if [ -f "$EXTENSION_DIR/metadata.json" ]; then
    ACTION='Updating'
    COMPLETION='Update'
else
    ACTION='Installing'
    COMPLETION='Installation'
fi

BASE_URL="https://github.com/$REPOSITORY/releases/download/$RELEASE_TAG"
GNOME_ASSET="discord-voice-overlay-gnome-$RELEASE_TAG.zip"
PLUGIN_ASSET="discord-voice-overlay-vencord-plugin-$RELEASE_TAG.zip"

TEMP_DIR=$(mktemp -d)

printf '%s Discord Voice Overlay to %s…\n' "$ACTION" "$RELEASE_TAG"
curl -fL --retry 3 -o "$TEMP_DIR/$GNOME_ASSET" \
    "$BASE_URL/$GNOME_ASSET"
curl -fL --retry 3 -o "$TEMP_DIR/$PLUGIN_ASSET" \
    "$BASE_URL/$PLUGIN_ASSET"
curl -fL --retry 3 -o "$TEMP_DIR/SHA256SUMS" \
    "$BASE_URL/SHA256SUMS"

(
    cd "$TEMP_DIR"
    sha256sum --ignore-missing -c SHA256SUMS
)

if [ ! -f "$VENCORD_PATH/package.json" ]; then
    if [ -e "$VENCORD_PATH" ]; then
        printf 'Vencord path exists but is not a source checkout: %s\n' \
            "$VENCORD_PATH" >&2
        exit 1
    fi

    mkdir -p "$(dirname -- "$VENCORD_PATH")"
    printf 'Downloading the Vencord source required for custom plugins…\n'
    git clone https://github.com/Vendicated/Vencord.git "$VENCORD_PATH"
else
    printf 'Updating the existing Vencord source checkout…\n'
    git -C "$VENCORD_PATH" pull --ff-only
fi

printf 'Installing Vencord dependencies…\n'
(
    cd "$VENCORD_PATH"
    pnpm install --frozen-lockfile
)

UNPACKED_DIR="$TEMP_DIR/unpacked"
mkdir -p "$UNPACKED_DIR"
unzip -q "$TEMP_DIR/$PLUGIN_ASSET" -d "$UNPACKED_DIR"

PLUGIN_SOURCE="$UNPACKED_DIR/discordVoiceOverlay"
if \
    [ ! -f "$PLUGIN_SOURCE/index.ts" ] \
    || [ ! -f "$PLUGIN_SOURCE/native.ts" ]
then
    printf 'The downloaded Vencord plugin package is incomplete.\n' >&2
    exit 1
fi

USER_PLUGINS="$VENCORD_PATH/src/userplugins"
TARGET_DIR="$USER_PLUGINS/discordVoiceOverlay"
mkdir -p "$USER_PLUGINS"
INSTALL_STAGE=$(mktemp -d "$USER_PLUGINS/.discordVoiceOverlay.installing.XXXXXX")
cp -R "$PLUGIN_SOURCE/." "$INSTALL_STAGE/"

if [ -e "$TARGET_DIR" ]; then
    BACKUP_ROOT="$DATA_HOME/discord-voice-overlay/vencord-plugin-backups"
    mkdir -p "$BACKUP_ROOT"
    TIMESTAMP=$(date -u '+%Y%m%dT%H%M%SZ')
    BACKUP_DIR="$BACKUP_ROOT/discordVoiceOverlay-$TIMESTAMP-$$"
    mv "$TARGET_DIR" "$BACKUP_DIR"
    printf 'Backed up the previous bridge to %s\n' "$BACKUP_DIR"
fi

mv "$INSTALL_STAGE" "$TARGET_DIR"
INSTALL_STAGE=''

printf 'Building Vencord with DiscordVoiceOverlay…\n'
(
    cd "$VENCORD_PATH"
    pnpm build
    pnpm inject
)

mkdir -p "$DATA_HOME/gnome-shell"
INSTALL_CACHE=$(mktemp -d "$DATA_HOME/gnome-shell/.dvo-install-cache.XXXXXX")

printf 'Installing the GNOME extension last…\n'
XDG_CACHE_HOME="$INSTALL_CACHE" \
    gnome-extensions install --force "$TEMP_DIR/$GNOME_ASSET"

if [ -d "$LEGACY_DIR" ]; then
    if gnome-extensions info "$LEGACY_UUID" >/dev/null 2>&1; then
        if ! gnome-extensions disable "$LEGACY_UUID"; then
            printf 'Warning: could not disable legacy extension %s.\n' \
                "$LEGACY_UUID" >&2
        fi
    fi

    LEGACY_BACKUP_ROOT="$DATA_HOME/discord-voice-overlay/legacy-extension-backups"
    mkdir -p "$LEGACY_BACKUP_ROOT"
    TIMESTAMP=$(date -u '+%Y%m%dT%H%M%SZ')
    LEGACY_BACKUP="$LEGACY_BACKUP_ROOT/$LEGACY_UUID-$TIMESTAMP-$$"
    mv "$LEGACY_DIR" "$LEGACY_BACKUP"
    printf 'Moved the legacy extension to %s\n' "$LEGACY_BACKUP"
fi

printf '\n%s complete.\n' "$COMPLETION"
printf '1. Fully restart Discord, enable DiscordVoiceOverlay in Vencord Plugins,\n'
printf '   and restart Discord again if prompted.\n'
printf '2. Log out of GNOME and log back in.\n'
printf '3. Enable and configure the extension:\n'
printf '   gnome-extensions enable %s\n' "$UUID"
printf '   gnome-extensions prefs %s\n' "$UUID"
printf '\nRerun the same releases/latest install command to update in the future.\n'
