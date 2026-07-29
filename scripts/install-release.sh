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
PNPM_RUNNER=''
PNPM_PACKAGE=''
PLUGIN_TARGET=''
PLUGIN_BACKUP=''
PLUGIN_ROLLBACK_NEEDED=false

if \
    ! printf '%s\n' "$RELEASE_TAG" \
        | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'
then
    printf 'Invalid release version: %s\n' "$RELEASE_TAG" >&2
    exit 2
fi

cleanup() {
    if [ "$PLUGIN_ROLLBACK_NEEDED" = true ]; then
        if [ -n "$PLUGIN_TARGET" ] && [ -e "$PLUGIN_TARGET" ]; then
            rm -rf -- "$PLUGIN_TARGET"
        fi

        if [ -n "$PLUGIN_BACKUP" ] && [ -e "$PLUGIN_BACKUP" ]; then
            mv "$PLUGIN_BACKUP" "$PLUGIN_TARGET"
            printf 'Restored the previous Vencord bridge after the failed update.\n' >&2
        fi
    fi

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

for command in awk curl git gnome-extensions grep node sha256sum unzip; do
    if ! command -v "$command" >/dev/null 2>&1; then
        printf 'Missing required command: %s\n' "$command" >&2
        printf 'See the Requirements section in the project README.\n' >&2
        exit 1
    fi
done

NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')

case "$NODE_MAJOR" in
    ''|*[!0-9]*)
        printf 'Could not determine the installed Node.js version.\n' >&2
        exit 1
        ;;
esac

if [ "$NODE_MAJOR" -lt 22 ]; then
    printf 'Node.js 22 or newer is required by Vencord; found %s.\n' \
        "$(node --version)" >&2
    exit 1
fi

if \
    ! command -v pnpm >/dev/null 2>&1 \
    && ! command -v corepack >/dev/null 2>&1 \
    && ! command -v npm >/dev/null 2>&1
then
    printf 'A pnpm runner is required.\n' >&2
    printf 'Install pnpm, or install Node.js with Corepack or npm included.\n' >&2
    exit 1
fi

configure_pnpm() {
    package_manager=$(
        cd "$VENCORD_PATH"
        node -p 'require("./package.json").packageManager ?? ""'
    )

    case "$package_manager" in
        pnpm@*)
            pnpm_version=${package_manager#pnpm@}
            ;;
        *)
            printf 'Vencord does not declare a usable pnpm version.\n' >&2
            exit 1
            ;;
    esac

    PNPM_PACKAGE="pnpm@${pnpm_version%%+*}"

    if \
        command -v corepack >/dev/null 2>&1 \
        && (
            cd "$VENCORD_PATH"
            corepack pnpm --version >/dev/null 2>&1
        )
    then
        PNPM_RUNNER='corepack'
    elif command -v pnpm >/dev/null 2>&1; then
        PNPM_RUNNER='pnpm'
    elif \
        command -v npm >/dev/null 2>&1 \
        && npm exec --yes --package="$PNPM_PACKAGE" -- \
            pnpm --version >/dev/null 2>&1
    then
        PNPM_RUNNER='npm'
    else
        printf 'Could not prepare pnpm for the Vencord build.\n' >&2
        exit 1
    fi

    printf 'Using %s through %s.\n' \
        "$package_manager" "$PNPM_RUNNER"
}

run_pnpm() {
    case "$PNPM_RUNNER" in
        corepack)
            corepack pnpm "$@"
            ;;
        pnpm)
            pnpm "$@"
            ;;
        npm)
            npm exec --yes --package="$PNPM_PACKAGE" -- pnpm "$@"
            ;;
        *)
            printf 'Internal error: pnpm runner was not configured.\n' >&2
            exit 1
            ;;
    esac
}

download() {
    url=$1
    destination=$2

    curl \
        --fail \
        --location \
        --silent \
        --show-error \
        --retry 3 \
        --retry-delay 1 \
        --connect-timeout 20 \
        --max-time 300 \
        --output "$destination" \
        "$url"
}

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
printf 'Downloading and verifying release packages…\n'
download \
    "$BASE_URL/$GNOME_ASSET" \
    "$TEMP_DIR/$GNOME_ASSET"
download \
    "$BASE_URL/$PLUGIN_ASSET" \
    "$TEMP_DIR/$PLUGIN_ASSET"
download \
    "$BASE_URL/SHA256SUMS" \
    "$TEMP_DIR/SHA256SUMS"

verify_asset() {
    asset=$1
    expected=$(
        awk -v asset="$asset" \
            '$2 == asset {print $1}' \
            "$TEMP_DIR/SHA256SUMS"
    )

    if [ "${#expected}" -ne 64 ]; then
        printf 'No valid checksum was published for %s.\n' "$asset" >&2
        exit 1
    fi

    case "$expected" in
        *[!0-9a-f]*)
            printf 'No valid checksum was published for %s.\n' "$asset" >&2
            exit 1
            ;;
    esac

    actual=$(
        sha256sum "$TEMP_DIR/$asset"
    )
    actual=${actual%% *}

    if [ "$actual" != "$expected" ]; then
        printf 'Checksum verification failed for %s.\n' "$asset" >&2
        exit 1
    fi

    printf '%s: OK\n' "$asset"
}

verify_asset "$GNOME_ASSET"
verify_asset "$PLUGIN_ASSET"

if [ ! -f "$VENCORD_PATH/package.json" ]; then
    if [ -e "$VENCORD_PATH" ]; then
        printf 'Vencord path exists but is not a source checkout: %s\n' \
            "$VENCORD_PATH" >&2
        exit 1
    fi

    mkdir -p "$(dirname -- "$VENCORD_PATH")"
    printf 'Downloading the Vencord source required for custom plugins…\n'
    git clone \
        --depth 1 \
        --single-branch \
        https://github.com/Vendicated/Vencord.git \
        "$VENCORD_PATH"
else
    printf 'Updating the existing Vencord source checkout…\n'
    git -C "$VENCORD_PATH" pull --ff-only
fi

configure_pnpm

printf 'Installing Vencord dependencies…\n'
(
    cd "$VENCORD_PATH"
    run_pnpm install --frozen-lockfile
)

UNPACKED_DIR="$TEMP_DIR/unpacked"
mkdir -p "$UNPACKED_DIR"
unzip -q "$TEMP_DIR/$PLUGIN_ASSET" -d "$UNPACKED_DIR"

PLUGIN_SOURCE="$UNPACKED_DIR/discordVoiceOverlay"
if \
    [ ! -f "$PLUGIN_SOURCE/index.ts" ] \
    || [ ! -f "$PLUGIN_SOURCE/native.ts" ] \
    || [ ! -f "$PLUGIN_SOURCE/avatar.js" ]
then
    printf 'The downloaded Vencord plugin package is incomplete.\n' >&2
    exit 1
fi

USER_PLUGINS="$VENCORD_PATH/src/userplugins"
TARGET_DIR="$USER_PLUGINS/discordVoiceOverlay"
PLUGIN_TARGET=$TARGET_DIR
mkdir -p "$USER_PLUGINS"
INSTALL_STAGE=$(mktemp -d "$USER_PLUGINS/.discordVoiceOverlay.installing.XXXXXX")
cp -R "$PLUGIN_SOURCE/." "$INSTALL_STAGE/"

if [ -e "$TARGET_DIR" ]; then
    BACKUP_ROOT="$DATA_HOME/discord-voice-overlay/vencord-plugin-backups"
    mkdir -p "$BACKUP_ROOT"
    TIMESTAMP=$(date -u '+%Y%m%dT%H%M%SZ')
    BACKUP_DIR="$BACKUP_ROOT/discordVoiceOverlay-$TIMESTAMP-$$"
    mv "$TARGET_DIR" "$BACKUP_DIR"
    PLUGIN_BACKUP=$BACKUP_DIR
    PLUGIN_ROLLBACK_NEEDED=true
    printf 'Backed up the previous bridge to %s\n' "$BACKUP_DIR"
fi

mv "$INSTALL_STAGE" "$TARGET_DIR"
INSTALL_STAGE=''
PLUGIN_ROLLBACK_NEEDED=true

printf 'Building Vencord with DiscordVoiceOverlay…\n'
(
    cd "$VENCORD_PATH"
    run_pnpm build
    run_pnpm inject
)
PLUGIN_ROLLBACK_NEEDED=false

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
