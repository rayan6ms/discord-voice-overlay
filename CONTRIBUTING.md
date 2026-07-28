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
