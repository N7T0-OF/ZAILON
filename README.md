# ZAILON — Universal Mod Launcher

ZAILON is a native desktop mod launcher built with Tauri, Rust, React and Vite.
It is not a website: it scans local mod folders, controls game executables, keeps
profiles locally and ships installers for Windows, Linux and macOS.

## What works

- Add games manually or discover Steam through its system location, library list and installed app manifests; review results before adding them.
- Scan, enable, disable and remove local mods without moving them outside the game folder.
- Keep separate local mod profiles, per-profile priority, notes, file-conflict indicators and playtime statistics.
- Right-click a game card (or use its ellipsis) to play, manage mods, open its folders, mark favorite, hide or remove only its ZAILON entry.
- Import covers, logos, icons, backgrounds, banners and videos; ZAILON copies them into its own local data directory.
- Download GameBanana mods through the desktop application.
- Native frameless window with working move, minimize, maximize/restore and close controls.
- Restore the last valid native window size, position and maximized state.
- Signed in-app update checks with Stable and Beta channels, progress, local backup and update log.

## User data and updates

ZAILON's application binaries are replaceable. Games, mod paths, profiles,
settings and playtime remain in the WebView profile managed by the operating
system, outside the installed application directory. Before an in-app update,
ZAILON also writes a snapshot and a local JSONL log into Tauri's application
local-data directory, for example `%LOCALAPPDATA%\\io.github.n7t0of.zailon\\`
on Windows. Only the three newest update backups are retained.

The updater accepts only signed Tauri packages published by the official
[`N7T0-OF/ZAILON`](https://github.com/N7T0-OF/ZAILON) GitHub releases. Version
comparison and the architecture-specific package choice are performed by the
Tauri updater, not by a browser download.

The first release that contains this updater must still be installed manually.
Every later signed release can update from inside ZAILON.

See [the updater guide](docs/UPDATES.md) for release and signing setup.

## Development

```bash
npm ci
npm run desktop:dev
```

## Validation and desktop build

```bash
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
npm run desktop:build
```

On Windows, the desktop Rust build requires the Visual Studio C++ build tools.

## Publishing a release

1. Increment the matching versions in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. Commit and push the change.
3. Create and push the matching tag, for example:

   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

GitHub Actions creates the release, uploads installers, signed updater artifacts,
`latest.json` metadata and `checksums-sha256.txt`.

The workflow's public package names follow this form:

- `ZAILON-windows-x86_64-nsis-setup.exe`
- `ZAILON-windows-x86_64-msi.msi`
- `ZAILON-linux-x86_64-appimage.AppImage`
- `ZAILON-linux-x86_64-deb.deb`
- `ZAILON-darwin-x86_64-dmg.dmg`
- `ZAILON-darwin-aarch64-dmg.dmg`

The iOS companion remains subject to Apple Developer signing and iOS sandbox
limitations; see [IOS signing notes](docs/IOS_SIGNING.md).
