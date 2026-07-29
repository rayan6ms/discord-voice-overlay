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

if ! command -v node >/dev/null 2>&1; then
    printf 'Node.js 22 or newer is required by Vencord.\n' >&2
    exit 1
fi

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

PACKAGE_MANAGER=$(
    cd "$VENCORD_PATH"
    node -p 'require("./package.json").packageManager ?? ""'
)

case "$PACKAGE_MANAGER" in
    pnpm@*)
        PNPM_VERSION=${PACKAGE_MANAGER#pnpm@}
        PNPM_PACKAGE="pnpm@${PNPM_VERSION%%+*}"
        ;;
    *)
        printf 'Vencord does not declare a usable pnpm version.\n' >&2
        exit 1
        ;;
esac

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
    esac
}

printf 'Using %s through %s.\n' "$PACKAGE_MANAGER" "$PNPM_RUNNER"

(
    cd "$VENCORD_PATH"
    run_pnpm build
    if [ "$BUILD_ONLY" = false ]; then
        run_pnpm inject
    fi
)

if [ "$BUILD_ONLY" = true ]; then
    printf 'Vencord built successfully. Apply the custom build for your client, then restart it.\n'
else
    printf 'Vencord built and the installer was launched. Fully restart Discord when it finishes.\n'
fi
