# @triliumnext/mobile

Capacitor shell that wraps the [`@triliumnext/client-standalone`](../client-standalone/) PWA build as a native mobile app. This package does not ship its own web assets — `webDir` in [capacitor.config.json](./capacitor.config.json) points directly at `../client-standalone/dist`.

## Prerequisites

- Android SDK + an emulator or attached device (set up `ANDROID_HOME` / `ANDROID_SDK_ROOT`).
- JDK 17+.
- The monorepo installed: `corepack enable && pnpm install` at the repo root.

## First-time setup

```bash
# 1. Build the standalone web app into apps/client-standalone/dist
pnpm --filter @triliumnext/mobile build

# 2. Generate the native Android project (one-off — commits as apps/mobile/android/)
pnpm --filter @triliumnext/mobile exec cap add android
```

## Everyday loop

```bash
pnpm --filter @triliumnext/mobile build          # rebuild standalone dist
pnpm --filter @triliumnext/mobile sync           # copy dist into android/
pnpm --filter @triliumnext/mobile run:android    # launch on emulator/device
# or
pnpm --filter @triliumnext/mobile open:android   # open Android Studio
```

## Known caveats (first milestone)

- **iOS is not wired up yet.** Android only.
- **Persistence is in-memory.** SharedArrayBuffer / OPFS requires `Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy` headers, which Capacitor's Android server does not set by default. The SQLite-WASM provider falls back to in-memory, so data is lost when the app process is killed. Fixing this is a follow-up.
- **Service worker dependency.** The standalone intercepts `/api/*`, `/bootstrap`, `/sync/*`, `/search/*` via a service worker. Android WebView supports SWs on `https://localhost`; if this ever breaks, the fallback is to patch the frontend's request layer to route through `local-bridge` directly on the main thread.
