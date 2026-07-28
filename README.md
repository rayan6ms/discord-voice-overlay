# Discord Voice Overlay for GNOME

Discord Voice Overlay shows the people in your current Discord voice channel over applications you choose in GNOME. It displays speaking, mute, deafen, and live-stream status without sending voice data or account data to a project-operated service.

## Features

- Overlay appears only while a user-selected application is focused
- Discord avatars and live speaking rings
- Mute, deafen, and stream indicators
- Speaking-only mode and inside/outside ring styles
- Draggable overlay and controls on multiple monitors
- Automatic row mirroring near a monitor's right edge
- Adjustable avatar size and username width
- Configurable large-call limit with a `+N more` row
- Preferences picker for currently open applications
- Editable edit-mode keyboard shortcut

## How it works

This project has two required components:

1. The Vencord user plugin reads the active Discord voice channel inside Discord.
2. It atomically writes JSON to `$XDG_RUNTIME_DIR/discord-voice-overlay/state.json`.
3. The GNOME Shell extension reads that local file and draws the overlay.

The runtime directory is private to your Linux user. The plugin creates its subdirectory with mode `0700` and the state file with mode `0600`. There is no project server, account, telemetry, or project-controlled cloud service. GNOME Shell loads avatar images from the Discord CDN URLs supplied by Discord, so avatar display does make direct network requests to Discord's CDN.

## Supported environment

- GNOME Shell **50**
- A Wayland GNOME session
- Discord Desktop with a source-built Vencord installation

Version 1.0.0 was tested on GNOME Shell 50.3 under Wayland. Other GNOME versions are intentionally not declared in `metadata.json`. Vesktop and browser Vencord builds have not been runtime-tested for this release.

The extension UUID is `discord-voice-overlay@rayan6ms.github.io`. Its GNOME metadata version is 19; that integer is separate from the project release tag `v1.0.0`.

## Prerequisites

- GNOME Shell 50 and the `gnome-extensions` command
- Discord Desktop for Linux
- Git, Node.js, and pnpm for the required custom Vencord build
- `curl` and `unzip` for the commands below

[Vencord](https://vencord.dev/) is a third-party Discord client modification. It is required because the GNOME extension cannot read Discord voice state on its own. Installing ordinary Vencord and installing this project's user plugin are separate steps. Vencord notes that client modifications are against Discord's Terms of Service; decide whether that trade-off is acceptable before installing it.

## Install from a GitHub Release

### 1. Install the GNOME extension

Download the exact v1.0.0 asset and install it:

```sh
cd "$HOME/Downloads"
curl -fLO https://github.com/rayan6ms/discord-voice-overlay/releases/download/v1.0.0/discord-voice-overlay-gnome-v1.0.0.zip
data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
mkdir -p "$data_home/gnome-shell"
install_cache=$(mktemp -d "$data_home/gnome-shell/.dvo-install-cache.XXXXXX")
XDG_CACHE_HOME="$install_cache" \
    gnome-extensions install --force ./discord-voice-overlay-gnome-v1.0.0.zip
rm -rf -- "$install_cache"
```

Log out through GNOME's system menu and log back in. GNOME Shell caches extension source, and a Wayland session cannot safely reload the running Shell in place.

The temporary cache directory keeps GNOME's extraction and installation on the same filesystem, avoiding a known `Can’t recursively copy directory` failure on systems where the normal cache is mounted separately.

Then enable the extension:

```sh
gnome-extensions enable discord-voice-overlay@rayan6ms.github.io
```

If you used a pre-release build with the old `discord-voice-overlay@local` UUID, disable that copy before enabling the public UUID:

```sh
gnome-extensions disable discord-voice-overlay@local
rm -rf "$HOME/.local/share/gnome-shell/extensions/discord-voice-overlay@local"
```

The settings schema and path did not change, so saved preferences are reused by the new UUID.

### 2. Install Vencord from source

The normal Vencord installer is sufficient for normal Vencord plugins, but **custom user plugins require a source build**. Follow Vencord's current [Installing from Source](https://docs.vencord.dev/installing/) guide. The following uses the location expected by this project's helpers:

```sh
mkdir -p "$HOME/.local/src"
git clone https://github.com/Vendicated/Vencord.git "$HOME/.local/src/Vencord"
cd "$HOME/.local/src/Vencord"
pnpm install --frozen-lockfile
```

If that checkout already exists, update it instead of cloning it again:

```sh
cd "$HOME/.local/src/Vencord"
git pull --ff-only
pnpm install --frozen-lockfile
```

### 3. Install this project's Vencord user plugin

Vencord does not provide a Plugins-UI import function for custom plugin ZIPs. The supported route is to put the plugin source under `src/userplugins`, rebuild Vencord, and apply that custom build. This follows Vencord's official [custom plugin instructions](https://docs.vencord.dev/installing/custom-plugins/).

Download and unpack the release asset:

```sh
cd "$HOME/Downloads"
curl -fLO https://github.com/rayan6ms/discord-voice-overlay/releases/download/v1.0.0/discord-voice-overlay-vencord-plugin-v1.0.0.zip
VENCORD_DIR="$HOME/.local/src/Vencord"
mkdir -p "$VENCORD_DIR/src/userplugins"
BACKUP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/discord-voice-overlay/vencord-plugin-backups"
mkdir -p "$BACKUP_DIR"
if [ -e "$VENCORD_DIR/src/userplugins/discordVoiceOverlay" ]; then
    mv "$VENCORD_DIR/src/userplugins/discordVoiceOverlay" \
        "$BACKUP_DIR/discordVoiceOverlay-$(date -u +%Y%m%dT%H%M%SZ)"
fi
unzip -q ./discord-voice-overlay-vencord-plugin-v1.0.0.zip \
    -d "$VENCORD_DIR/src/userplugins"
```

Build and inject the custom Vencord copy:

```sh
cd "$HOME/.local/src/Vencord"
pnpm build
pnpm inject
```

Choose your Discord installation in the Vencord installer, then fully close and restart Discord. Open **Discord Settings → Vencord → Plugins**, find **DiscordVoiceOverlay**, enable it, and restart Discord again if prompted.

If you use Vesktop, run `pnpm build`, then follow the Vesktop section of Vencord's [source-install guide](https://docs.vencord.dev/installing/#installing-your-custom-build) to select the generated `dist` directory. Vesktop remains unverified for this release.

### 4. Select applications and configure the overlay

Open Preferences:

```sh
gnome-extensions prefs discord-voice-overlay@rayan6ms.github.io
```

In **Open applications**, switch on each application where the overlay should appear. The application must be running so the picker can see it. Saved applications that are closed appear in a separate removable list. Changes take effect immediately.

The public default allowlist is empty, so the overlay will not appear over any application until you select one.

The default edit-mode shortcut is **Ctrl+,**. Change it under **Keyboard shortcut** with a GTK accelerator such as `<Shift><Alt>F1`; clear the field to disable it. While an allowed application is focused, use the shortcut to show the controls:

- **Overlay** turns voice rows on or off.
- **Speaking only** hides silent users.
- **Ring** chooses an inside or outside speaking ring.
- **Avatar**, **Name**, and **Users** adjust sizing and the visible-user limit.
- Drag **Voice overlay** and **Controls** independently.
- Select **Done** or press the shortcut again to leave edit mode.

## Verify downloads

Download `SHA256SUMS` from the same release, put it beside both ZIP files, then run:

```sh
cd "$HOME/Downloads"
sha256sum -c SHA256SUMS
```

## Troubleshooting

### No users appear

Confirm all of the following:

- Discord is connected to a voice channel.
- DiscordVoiceOverlay is enabled in Vencord.
- The focused application is enabled in extension Preferences.
- `$XDG_RUNTIME_DIR/discord-voice-overlay/state.json` exists.

Inspect the state without publishing it:

```sh
test -r "$XDG_RUNTIME_DIR/discord-voice-overlay/state.json" &&
    python3 -m json.tool "$XDG_RUNTIME_DIR/discord-voice-overlay/state.json" >/dev/null &&
    printf 'Vencord state is present and valid JSON.\n'
```

If the file is missing, fully restart Discord. If it is still missing, rebuild Vencord and confirm the plugin is enabled.

### The application picker is unavailable

The picker talks to the enabled extension over the user's D-Bus session. Check:

```sh
gnome-extensions info discord-voice-overlay@rayan6ms.github.io
gdbus call --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell/Extensions/DiscordVoiceOverlay \
    --method org.gnome.Shell.Extensions.DiscordVoiceOverlay.ListOpenApplications
```

If the extension is enabled but the D-Bus call fails, reinstall the same release, log out and back in, and reopen Preferences.

### The extension is installed but old code is active

GNOME Shell keeps loaded JavaScript in memory. Log out through the system menu and log back in. Do not kill or replace the live GNOME Shell process.

### Shortcut conflicts

Choose another valid GTK accelerator in Preferences. Desktop or application shortcuts may intercept the same combination. Clear the shortcut field if you only want to configure the extension through Preferences.

### Fullscreen overlay problems

The extension asks Mutter to keep an allowed focused fullscreen application composited. If the overlay is hidden, try windowed fullscreen and check GNOME extension errors:

```sh
journalctl --user -b -o cat | grep -F DiscordVoiceOverlay
```

Compositor behavior varies by graphics driver and application. Include those details in a bug report.

### Unsupported GNOME version

Only GNOME Shell 50 is declared. Check with:

```sh
gnome-shell --version
```

Do not disable GNOME's extension version validation as a substitute for compatibility testing.

### Vencord build or injection fails

From the Vencord checkout, update dependencies and rebuild:

```sh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
pnpm inject
```

Use pnpm, not npm or yarn. For client-specific installation steps, consult Vencord's [official source-install documentation](https://docs.vencord.dev/installing/). Vencord does not support third-party custom plugins, so project-specific problems should be reported here rather than to Vencord.

## Privacy and security

- Voice channel metadata, user IDs, display names, state flags, and avatar URLs stay in the per-user runtime file.
- The project has no telemetry, analytics, remote API, or update checker.
- Avatar images are requested directly from Discord's CDN by GNOME Shell.
- Any process running as your Linux user can generally read your session D-Bus and, subject to filesystem permissions, act with your account privileges. The application picker exposes open application names, identifiers, and up to three window titles on the user's D-Bus session.
- A Vencord `native.ts` plugin can use Node.js APIs. Review custom plugin source before installing it.
- Discord, Vencord, and GNOME are independent projects and do not endorse this project.

## Updating

Install the new GNOME ZIP with `gnome-extensions install --force`, then log out and back in. Replace the matching `discordVoiceOverlay` user-plugin folder, rebuild Vencord, apply the custom build, and restart Discord. The repository helper backs up only an existing plugin with that exact name.

## Uninstalling

Disable and remove the GNOME component:

```sh
gnome-extensions disable discord-voice-overlay@rayan6ms.github.io
rm -rf "$HOME/.local/share/gnome-shell/extensions/discord-voice-overlay@rayan6ms.github.io"
```

Remove the Vencord component and rebuild:

```sh
VENCORD_DIR="$HOME/.local/src/Vencord"
rm -rf "$VENCORD_DIR/src/userplugins/discordVoiceOverlay"
cd "$VENCORD_DIR"
pnpm build
pnpm inject
```

Fully restart Discord afterward. Removing the entire source-built Vencord installation is a separate operation covered by Vencord's documentation.

## Development

Clone this repository and run:

```sh
git clone https://github.com/rayan6ms/discord-voice-overlay.git
cd discord-voice-overlay
./scripts/check.sh
```

Repository layout:

```text
gnome-extension/discord-voice-overlay@rayan6ms.github.io/  GNOME extension
vencord-plugin/discordVoiceOverlay/                         Vencord bridge
scripts/check.sh                                            Static checks
scripts/package-extension.sh                                GNOME ZIP builder
scripts/install-extension.sh                                Local/archive installer
scripts/install-vencord-plugin.sh                           Safe plugin installer
scripts/build-vencord.sh                                    Vencord build helper
scripts/build-release.sh                                    Public artifact builder
```

Install the development plugin and build Vencord:

```sh
./scripts/install-vencord-plugin.sh "$HOME/.local/src/Vencord"
./scripts/build-vencord.sh "$HOME/.local/src/Vencord"
```

Install the extension from source:

```sh
./scripts/install-extension.sh
```

That helper creates a package and uses `gnome-extensions install --force`; it never restarts GNOME Shell.

Run all repository checks:

```sh
./scripts/check.sh
```

Build and validate an extension package:

```sh
./scripts/package-extension.sh
```

Build all release assets and SHA-256 checksums in a clean `dist/` directory:

```sh
./scripts/build-release.sh v1.0.0
```

The checks validate JavaScript syntax, metadata, schema consistency, the empty default allowlist, shell syntax, UUID/version consistency, and common publication leaks. When ShellCheck is installed, it runs automatically. Vencord plugin compatibility is best validated by installing it into a current Vencord checkout and running `pnpm build`.

GNOME runtime changes should be tested in a disposable nested Shell when practical. GNOME 49 and later provide:

```sh
dbus-run-session gnome-shell --devkit --wayland
```

Do not test by killing the user's live desktop Shell.

## Contributing and reporting bugs

Read [CONTRIBUTING.md](CONTRIBUTING.md), run `./scripts/check.sh`, and open a focused pull request. Bug reports should use the repository template and include GNOME Shell version, distribution, session type, extension version, Vencord version, reproduction steps, relevant errors, and the D-Bus application-list result.

Security-sensitive reports should follow [SECURITY.md](SECURITY.md).

## Licence

This project is licensed under the GNU General Public License, version 3 or later (`GPL-3.0-or-later`). See [LICENSE](LICENSE). The Vencord user plugin uses the same GPL-compatible licence as Vencord.
