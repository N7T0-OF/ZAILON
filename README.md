# ZAILON — Universal Mod Launcher

> Local-first universal mod manager for anime, UE5, and indie games.

Built by [@souanpt](https://github.com/Sankaiii)

## Features

- 🎮 Universal game support — add any game
- 📦 Profile system — multiple mod sets per game
- 🧭 Explore mods — GameBanana, Nexus, CurseForge, AyakaMods
- ⚡ One-click install with auto-extraction
- 🕒 Playtime tracking per game and profile
- 🔒 Offline-first — no account, no cloud required
- 🎨 Dark gold premium UI — 854×480 windowed mode

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Native installers

ZAILON is a native Tauri application, not a website. Create and push a version
tag (for example `v1.0.0`) to build a GitHub Release containing Windows,
Linux, and macOS installers. The workflow is in
[`release.yml`](.github/workflows/release.yml).

The optional signed iOS companion workflow requires Apple Developer signing
material; see [`docs/IOS_SIGNING.md`](docs/IOS_SIGNING.md).
