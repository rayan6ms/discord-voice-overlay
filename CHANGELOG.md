# Changelog

All notable public changes are documented here.

## [1.0.5] - 2026-07-28

GNOME extension metadata version: 24.

### Added

- Publish Discord voice changes from relevant Flux events instead of repeatedly rebuilding unchanged state.
- Monitor atomic state-file replacements with Gio for immediate GNOME updates, with a one-second fallback only if monitoring is unavailable.
- Reuse unchanged user-row actors and avatar textures when another user's state changes.
- Test atomic state monitoring latency and the pure render-layout model.

### Changed

- Remove the fixed 200 ms Discord polling loop and 100 ms GNOME polling loop; idle operation now requires only the existing 15-second crash-detection heartbeat.
- Schedule stale-state invalidation at its exact deadline instead of discovering it through polling.
- Split window discovery, state monitoring, render modelling, and user-list rendering into focused extension modules.

## [1.0.4] - 2026-07-28

GNOME extension metadata version: 23.

### Added

- Undo and redo for edit-mode changes with Ctrl+Z, Ctrl+Y, and Ctrl+Shift+Z.
- Escape now exits edit mode and restores every setting and position from the start of that edit session.
- Tested bounded edit history so a new change correctly clears the redo branch.

### Fixed

- Deliver grabbed motion and release events directly to each drag handle instead of waiting for events on the stage.
- Release the pointer grab through a watchdog if an abnormal input path still loses the button-release signal.
- Stop emitting GNOME Shell theme warnings for avatar positioning and username sizing.
- Stop the refresh timer from touching overlay actors after GNOME Shell destroys them during shutdown.
- Restore an existing development bridge if its replacement is interrupted.

### Changed

- Validate release tags as exact semantic versions instead of accepting partial glob matches.
- Verify both downloaded release packages against explicit published checksums.
- Remove an unused `unzip` requirement from extension packaging.

## [1.0.3] - 2026-07-28

GNOME extension metadata version: 22.

### Added

- Automatic use of Vencord's declared pnpm version through Corepack or npm when pnpm is not installed.
- A right-edge overlay screenshot in the README.

### Fixed

- Grab pointer input for the full drag so fast cursor movement cannot lose the button-release event.
- End a stale drag without snapping when motion arrives after the primary button is no longer pressed.
- Isolate unusual or disappearing windows so one failed identity lookup cannot break the application picker.
- Ignore malformed application-picker rows instead of failing the preferences page.
- Restore the previous Vencord bridge automatically when an update build fails.

### Changed

- Shortened the README by removing manual installation, duplicate update guidance, niche troubleshooting, security-reporting, and development sections.
- Removed the redundant README from the packaged Vencord bridge.

## [1.0.2] - 2026-07-28

GNOME extension metadata version: 21.

### Added

- A single-source `VERSION` file for release scripts and CI.
- Install-or-update detection and automatic backup migration for the prerelease `discord-voice-overlay@local` UUID.

### Fixed

- Align every avatar to the same outer edge when the overlay mirrors on the right side.
- Restore the detached voice-overlay drag handle when a drag is cancelled.
- Cancel and restore an in-progress drag when edit mode closes or the focused application changes.
- Ignore non-primary mouse-button releases during a primary-button drag.
- Use the pointer destination instead of the actor centre when selecting the drop monitor.
- Apply final button-release coordinates even when no final motion event was delivered.

### Changed

- The primary install command now uses GitHub's stable `releases/latest` URL and serves as the update command too.
- Overlay rows remain non-reactive in edit mode; only their explicit drag handle captures input.

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
[1.0.2]: https://github.com/rayan6ms/discord-voice-overlay/releases/tag/v1.0.2
[1.0.3]: https://github.com/rayan6ms/discord-voice-overlay/releases/tag/v1.0.3
[1.0.4]: https://github.com/rayan6ms/discord-voice-overlay/releases/tag/v1.0.4
[1.0.5]: https://github.com/rayan6ms/discord-voice-overlay/releases/tag/v1.0.5
