# Yggdrasil

Yggdrasil is the desktop EXE workspace built on Tauri. This repository contains the React renderer, the Rust desktop runtime, shared Tauri API wrappers, local persistence, and the signed GitHub Release updater chain.

## Repository layout

- `apps/renderer` — renderer UI
- `apps/tauri` — Tauri package
- `apps/tauri/src-tauri` — Rust runtime, storage, native commands
- `packages/api-client` — shared renderer-side API wrappers

## Development

Requirements:

- Node.js 18+
- pnpm 10
- Rust stable

Install dependencies:

```bash
pnpm install
```

Start the desktop app in development:

```bash
pnpm dev
```

Useful commands:

```bash
pnpm build:renderer
pnpm build:tauri
pnpm package:tauri
pnpm lint:renderer
pnpm test:renderer
```

## In-app About and updates

The app exposes an `About` page as a standalone maintenance section below `Settings`. It supports:

- checking GitHub Releases for updates
- downloading the update package only
- downloading and installing directly
- opening repository, releases, and issues pages

Updater source:

- repository: [GALIAIS/Yggdrasil](https://github.com/GALIAIS/Yggdrasil)
- metadata endpoint: `https://github.com/GALIAIS/Yggdrasil/releases/latest/download/latest.json`

## Release pipeline

GitHub Actions workflow:

- `.github/workflows/release.yml`

Release trigger:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Required repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

The public updater key is embedded in:

- `apps/tauri/src-tauri/tauri.conf.json`

## Storage

The desktop runtime persists workspace data locally and uses split SQLite-backed storage by domain instead of one monolithic database file.

## License

AGPL-3.0
