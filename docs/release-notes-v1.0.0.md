# Discord Voice Overlay v1.0.0

Discord Voice Overlay displays the members of your current Discord voice channel over applications selected in GNOME Preferences. It includes speaking rings, mute/deafen and live-stream status, draggable multi-monitor positioning, right-edge mirroring, and compact handling of large calls.

This release supports **GNOME Shell 50 on Wayland**. It requires Discord with a source-built Vencord installation and the included custom Vencord user plugin.

## Install

1. Download `discord-voice-overlay-gnome-v1.0.0.zip` and install it with `gnome-extensions install --force`.
2. Log out through GNOME and log back in, then enable `discord-voice-overlay@rayan6ms.github.io`.
3. Put the `discordVoiceOverlay` folder from `discord-voice-overlay-vencord-plugin-v1.0.0.zip` under Vencord's `src/userplugins/`.
4. Build and apply the custom Vencord installation, restart Discord, and enable **DiscordVoiceOverlay**.
5. Open extension Preferences and select the applications where the overlay may appear.

See the [complete installation and troubleshooting guide](https://github.com/rayan6ms/discord-voice-overlay#install-from-a-github-release).

GNOME Shell caches extension JavaScript. A logout/login is required on Wayland after installing or updating the extension.

## Known limitations

- GNOME versions other than 50 and Vencord clients other than Discord Desktop have not been runtime-tested for this release.
- Vencord custom plugins require a source build and cannot be imported through the Plugins UI.
- Fullscreen composition can depend on the application and graphics stack.

`SHA256SUMS` covers both downloadable ZIP assets. Verify it with `sha256sum -c SHA256SUMS`.
