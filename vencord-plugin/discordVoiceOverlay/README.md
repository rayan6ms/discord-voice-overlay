# DiscordVoiceOverlay Vencord user plugin

This folder is the local bridge required by [Discord Voice Overlay for GNOME](https://github.com/rayan6ms/discord-voice-overlay).

The project's release installer handles this folder automatically. These manual instructions stay with the downloadable plugin package so it remains self-describing.

Custom Vencord plugins cannot be imported through the Plugins UI. Place this whole `discordVoiceOverlay` folder at:

```text
Vencord/src/userplugins/discordVoiceOverlay/
```

Then run `pnpm build`, apply the custom Vencord build for your Discord client, restart Discord, and enable **DiscordVoiceOverlay** in Vencord's Plugins settings.

Full installation and troubleshooting steps are in the project's main README. Vencord's official custom-plugin instructions are at <https://docs.vencord.dev/installing/custom-plugins/>.
