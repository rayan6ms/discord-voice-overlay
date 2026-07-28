# Contributing

Thanks for improving Discord Voice Overlay. Keep runtime changes focused: the extension runs inside GNOME Shell, so a small cleanup mistake can affect the whole desktop session.

Before opening a pull request:

1. Base the change on `main`.
2. Run `./scripts/check.sh`.
3. If the Vencord plugin changed, install it into a current Vencord checkout and run `pnpm build`.
4. If GNOME runtime code changed, increment the integer metadata version once and update the matching constant and changelog.
5. Test in a disposable nested GNOME Shell when practical. Never require reviewers to kill their live GNOME Shell.

Bug reports should use the issue template. Include a minimal reproduction and remove private channel names, usernames, window titles, and tokens from logs.

By contributing, you agree that your contribution is licensed under `GPL-3.0-or-later`.

## Local development

Clone the repository and run the project checks:

```sh
git clone https://github.com/rayan6ms/discord-voice-overlay.git
cd discord-voice-overlay
./scripts/check.sh
```

Install the development bridge into a Vencord source checkout and build it:

```sh
./scripts/install-vencord-plugin.sh "$HOME/.local/src/Vencord"
./scripts/build-vencord.sh "$HOME/.local/src/Vencord"
```

Package and install the GNOME extension:

```sh
./scripts/install-extension.sh
```

Log out and back in to load changed GNOME Shell code. When practical, test runtime changes in a disposable nested Shell:

```sh
dbus-run-session gnome-shell --devkit --wayland
```

Build all release assets:

```sh
./scripts/build-release.sh
```
