# dsh-desktop-gui

A desktop (Electron) shell for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) browser GUI. It starts the harness web backend, opens it in a native window, and stops the backend when the window closes — no browser tab, no orphaned server.

## What it does

- Launches `dsh --profile web` on `127.0.0.1:3080` (the harness default) and waits until it answers.
- Opens a native Electron window on that URL.
- Routes external links (documentation, etc.) to the system browser.
- Kills the backend process tree on window close, so nothing keeps running in the background.

## Requirements

- Node.js 22.19+ (the harness requirement).
- A DeepSeek Harness installation with `dsh` on `PATH` (see the harness README for install options).
- The `web` profile (auto-initialized by `dsh --profile web` on first run).

## Run

```sh
npm install   # or: pnpm install
npm start     # or: pnpm start
```

On first run the web backend initializes its profile and binds `127.0.0.1:3080`. If that port is already in use by a running harness web server, the app reuses it instead of starting a second one (and will not kill it on close).

## Package (Windows installer)

```sh
pnpm install
pnpm dist   # electron-builder --win (NSIS)
```

The installer lands in `dist/DeepSeek Harness Desktop Setup <version>.exe`, with the unpacked app under `dist/win-unpacked/`. The NSIS installer creates desktop and start-menu shortcuts.

> **Note:** `electron-builder` 26.15.x references `ElectronDownloadCacheMode`, which only exists in `@electron/get` v4+, while still declaring `@electron/get@^3.0.0`. This repo pins that request to v4 via the `overrides` entry in `pnpm-workspace.yaml`; keep it until upstream fixes the dependency range.

## How it works

`src/main.js` is a plain Electron main process:

1. Probe that `dsh` is on `PATH`.
2. Spawn the web backend (`dsh --profile web`) with inherited stdio.
3. Poll `http://127.0.0.1:3080` until it responds (30s timeout).
4. Open a `BrowserWindow` (context isolation on, node integration off) on that URL.
5. On window close, kill the spawned process tree (`taskkill /T /F` on Windows, `SIGTERM` elsewhere).

## Known Limitations and Deferred Work

- **Fixed port** — it assumes the harness web default `127.0.0.1:3080`; a running server on another port is not discovered automatically.
- **Reuses a pre-existing server** — if `3080` is already answering, the app attaches to it and leaves it running on close (it only tears down a server it started).
