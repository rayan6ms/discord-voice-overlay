#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
set -eu

BUILD_ONLY=false
VENCORD_PATH=${VENCORD_DIR:-}

for argument in "$@"; do
    case "$argument" in
        --build-only)
            BUILD_ONLY=true
            ;;
        -*)
            printf 'Unknown option: %s\n' "$argument" >&2
            exit 2
            ;;
        *)
            if [ -n "$VENCORD_PATH" ]; then
                printf 'Only one Vencord checkout path may be supplied.\n' >&2
                exit 2
            fi
            VENCORD_PATH=$argument
            ;;
    esac
done

if [ -z "$VENCORD_PATH" ]; then
    for candidate in \
        "$HOME/.local/src/Vencord" \
        "$HOME/Vencord" \
        "$HOME/Documents/Vencord"
    do
        if [ -f "$candidate/package.json" ]; then
            VENCORD_PATH=$candidate
            break
        fi
    done
fi

if [ -z "$VENCORD_PATH" ] || [ ! -f "$VENCORD_PATH/package.json" ]; then
    printf 'Vencord checkout not found. Pass its path or set VENCORD_DIR.\n' >&2
    exit 1
fi

if [ ! -f "$VENCORD_PATH/src/userplugins/discordVoiceOverlay/index.ts" ]; then
    printf 'DiscordVoiceOverlay is not installed in this Vencord checkout.\n' >&2
    exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
    printf 'pnpm is required. Follow https://docs.vencord.dev/installing/\n' >&2
    exit 1
fi

(
    cd "$VENCORD_PATH"
    pnpm build
    if [ "$BUILD_ONLY" = false ]; then
        pnpm inject
    fi
)

if [ "$BUILD_ONLY" = true ]; then
    printf 'Vencord built successfully. Apply the custom build for your client, then restart it.\n'
else
    printf 'Vencord built and the installer was launched. Fully restart Discord when it finishes.\n'
fi
