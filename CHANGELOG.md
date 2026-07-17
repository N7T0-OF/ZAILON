# Changelog

## 1.1.1 — Native test compatibility

- Enabled Tauri's asset protocol feature explicitly so native unit tests validate the same local-resource configuration as packaged builds.

## 1.1.0 — Steam library discovery and game management

- Replaced the directory-only Steam scan with platform Steam discovery, `libraryfolders.vdf` parsing and `appmanifest_*.acf` metadata.
- Added a review screen with progress, diagnostics, duplicate prevention and executable selection before games are added.
- Added right-click and ellipsis actions for games: play, manage mods, open game/mod folders, favorites, hide and safe library removal.
- Added persistent local game resources (cover, logo, icon, background, banner and video) with file copying and drag-and-drop import.
- Added profile rename/removal, per-profile mod priorities, notes and file-level conflict indicators.
- Clarified that direct-folder deployments do not yet provide a virtual filesystem or a guaranteed game-engine load order.

## 1.0.1 — Native window and signed updater

- Fixed the desktop content surface so it fills the real native window at every size.
- Added working native minimize, maximize/restore, close and title-bar drag behavior.
- Added restoration of a valid last window size, position and maximized state.
- Added signed in-app updates with Stable/Beta channels, real progress, retry and local update logs.
- Added a local pre-update snapshot that preserves existing games, mod profiles, settings, statistics and resources.
- Updated GitHub release automation to publish updater metadata, signatures and SHA-256 checksums.
