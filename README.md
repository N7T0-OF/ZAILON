# ZAILON — Universal Mod Launcher

ZAILON is a native desktop mod launcher built with Tauri, Rust, React and Vite.
It is not a website: it scans local mod folders, controls game executables, keeps
profiles locally and ships installers for Windows, Linux and macOS.

## What works

- Add games manually or run quick/full local discovery across Steam manifests, Epic Games manifests and Windows installed-application records; review and filter every result before import.
- Scan, enable, disable and remove local mods without moving them outside the game folder.
- Keep a shared installed-mod catalogue per game and lightweight profiles with activation, priority, notes, file-conflict rules and playtime statistics. Existing v1 data is migrated automatically.
- Import one or more existing mod folders through the native Generic/Cyberpunk/Bethesda/Unreal Pak/XXMI scanner, then review every detected root before transactional copy.
- Import an arbitrarily large root folder as a cancellable background task, keep every completed item in persistent staging and review the task history from the status bar.
- Deploy staged mods with an explicit Direct Copy backend that never overwrites an existing destination; each staged item includes a local manifest and file inventory.
- Duplicate profiles and exchange light or complete `.zailon-profile` archives without exporting secrets or personal source paths.
- Right-click a game card (or use its ellipsis) to play, manage mods, open its folders, mark favorite, hide or remove only its ZAILON entry.
- Import covers, logos, icons, backgrounds, banners, SVGs and videos; preview, position and resize them before saving. ZAILON copies approved resources into its own local data directory.
- Search official Steam artwork from the native backend and cache only validated images from trusted HTTPS hosts; optional automatic artwork applies to newly detected games.
- Search the remote GameBanana game catalogue, pin/reopen games, browse real paginated results, filter/sort the loaded page, hide adult results by default and install a selected file into the explicitly configured target game.
- Store Nexus and CurseForge credentials in the operating-system credential vault; register or revoke the Windows `nxm://` association only after explicit consent.
- Validate Nexus from the native backend, show the masked connection/account/quota status, browse supported Nexus feeds and keep the personal key out of frontend state, logs and serialized IPC payloads.
- Create desktop shortcuts with validated internal `zailon://launch/game/...` identifiers and optional profile selection.
- Track games launched by ZAILON and publish a configurable Discord Rich Presence through the local Discord IPC socket without a client secret.
- Choose Normal, Large or Very large text and Compact or Comfortable UI density; visible UI text has a 14 px minimum in the smallest mode.
- Native frameless window with working move, minimize, maximize/restore and close controls.
- Restore the last valid native window size, position and maximized state.
- Signed in-app update checks with Stable and Beta channels, progress, local backup and update log.
- Review the static reference-manager audit and copyright decisions in [`docs/example-managers-analysis.md`](docs/example-managers-analysis.md).

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
cargo test --manifest-path src-tauri/Cargo.toml --lib
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
limitations. Desktop-only process launching, arbitrary game-folder access, local
mod deployment, desktop shortcuts and Discord desktop IPC are not available in
the iOS sandbox; see [IOS signing notes](docs/IOS_SIGNING.md).
