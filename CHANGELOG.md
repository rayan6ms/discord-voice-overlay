# Changelog

All notable public changes are documented here.

## [1.0.1] - 2026-07-28

GNOME extension metadata version: 20.

### Added

- One-command release installer that downloads and verifies the packages, prepares the required Vencord source build, and installs the GNOME extension last.
- Low-frequency bridge heartbeat and a tested 45-second freshness timeout so an unclean Discord exit cannot leave the overlay visible indefinitely.
- Screenshots of the overlay, edit controls, and application picker.

### Fixed

- Preserve stable voice-member ordering instead of moving active speakers to the front while speaking-only mode is off.

### Changed

- Reworked the README around a short end-user installation and setup path.
- Reduced extension state polling from 40 to 10 reads per second.
- Consolidated security reporting into the README and GitHub's private advisory link.
- Removed the repository copy of v1.0.0 release notes; GitHub Releases remains the canonical home for per-release notes.

## [1.0.0] - 2026-07-28

Initial public release. GNOME extension metadata version: 19.

### Added

- Focus-aware Discord voice overlay for user-selected applications.
- Speaking, mute, deafen, and live-stream indicators.
- Speaking-only and inside/outside speaking-ring modes.
- Independent multi-monitor positioning for the overlay and controls.
- Right-edge mirroring, username ellipsization, and large-call limiting.
- Preferences application picker and editable edit-mode shortcut.
- Reproducible extension/plugin release packaging with SHA-256 checksums.
- Safe installation helpers, project validation, and GitHub Actions CI.

### Fixed

- Reject malformed or non-object bridge state without throwing in GNOME Shell.
- Serialize Vencord bridge publications, retry failed writes, and clear state only after pending writes finish.
- Reapply private permissions to the runtime state directory and temporary file.
- Back up only an existing matching Vencord user plugin before replacement.

### Changed

- Adopted the permanent public UUID `discord-voice-overlay@rayan6ms.github.io`.
- Kept the existing GSettings schema and path so pre-release preferences migrate.
- Replaced local-only author metadata and documentation with public project identity.

### Known limitations

- Only GNOME Shell 50 on Wayland has been runtime-tested.
- A source-built Vencord checkout is required; custom plugins cannot be imported through Vencord's Plugins UI.
- GNOME Shell must be restarted by logging out and back in after source changes or extension updates.
- Fullscreen composition behavior can still depend on the application and graphics stack.

[1.0.0]: https://github.com/rayan6ms/discord-voice-overlay/releases/tag/v1.0.0
[1.0.1]: https://github.com/rayan6ms/discord-voice-overlay/releases/tag/v1.0.1
