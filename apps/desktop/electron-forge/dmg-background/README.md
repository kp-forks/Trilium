# macOS DMG background

`background.png` / `background@2x.png` (and the `-dev` nightly pair) are the Finder-window background
of the mounted `.dmg` — the *drag the app into Applications* screen. Wired into the `@electron-forge/maker-dmg`
config in `electron-forge/forge.config.ts` (`background` + `contents` + `window`).

Generated from `background.html`; don't edit the PNGs by hand. Change the HTML and regenerate:

```bash
pnpm --filter desktop generate-dmg-background
```

Runs on any OS (headless Chromium via the repo's `@playwright/test`) — **but the DMG itself can only be
built and visually verified on macOS** (`appdmg` is `os: [darwin]` and isn't installed elsewhere). The
`contents` icon coordinates in `forge.config.ts` are a best effort matched to the artwork; fine-tune
them on a real macOS build.

`preview.png` is a faithful mock of the assembled Finder window: the real app icon (`icon.icns`) and
the real macOS Applications-folder icon composited at the same `contents` coordinates the DMG uses,
under a reconstructed Finder title bar, with the icon labels Finder draws. On macOS the two icons are
rendered from their `.icns` via `sips` (pixel-perfect); off macOS it falls back to the flat logo and a
drawn folder so the script still runs anywhere. It is **reference only** — appdmg never uses it (it only
reads `background.png`/`@2x`). Kept reproducible from source so it isn't a mystery image; regenerate with
`pnpm --filter desktop generate-dmg-preview`.

## How it differs from the Windows splash

- **Static, not animated.** A DMG background is a Finder window background image — it can't animate.
- **PNG + `@2x` for Retina.** appdmg auto-packages `background.png` and `background@2x.png` into a
  multi-resolution TIFF. Finder *is* Retina-aware (unlike Squirrel's loading window), so it renders crisp.
- **One image per channel, not per theme.** Like the splash, the background is baked and doesn't follow
  Finder's light/dark mode. Crucially, **setting a background picture forces Finder to render the window in
  light mode**, so the icon captions are drawn in **black in both light and dark system themes** — not the
  white-on-dark you might expect in Dark mode. And the caption colour is Finder's alone: the DMG format has
  no label-colour field (the `icvp` icon-view plist appdmg/ds-store write exposes only icon size, positions,
  window size, and background), and appdmg can't ship separate dark/light backgrounds (only tools like
  DropDMG can). That black caption colour is why the surface is **light** (see *Design*) — the captions read
  on their own, with no per-label trick needed.

## Design

- **Light surface, reused verbatim from the in-app setup screen** (`apps/client/src/setup.css`, light
  theme): soft indigo/purple/blue radial glows over the near-white left-pane base (`#f2f2f2`). The light
  surface keeps Finder's forced-black captions legible on their own. The same gradient is used for both
  channels; **nightly** is distinguished only by the purple leaf mark and the NIGHTLY badge. The wordmark
  is dark (`#2b3038`, muted `#7c828c` for "Notes"), and the drag arrow is a muted neutral grey, kept quiet
  so it doesn't compete with the icons.
- The icons sit directly on the surface (no tiles/plates), app on the left and `/Applications` alias on the
  right, with the drag arrow between them. Their **centers** must line up with the `contents` coordinates
  in `forge.config.ts`, which use a **top-left** origin, y increasing downward, with `(x, y)` the icon
  center — Finder's `.DS_Store` `Iloc` convention (confirmed by appdmg's own example, where `y: 344` sits
  near the *bottom* of the window). So the `contents` y is measured from the top, not `windowHeight - y`.
  `contents` uses **y = 200** (near the vertical middle), so Finder draws the captions at **~y = 278**.
- **No baked text beyond the "Trilium Notes" wordmark** (a brand name, not translated). The DMG ships one
  image for every locale, so there is no localized instruction line — the arrow conveys the action, and
  Finder draws the app name and "Applications" captions under the real icons.

## Output contract

- 640 × 400 pt window; `background.png` is 640 × 400, `background@2x.png` is 1280 × 800.
- `iconSize` 128; app icon centered at (180, 200), Applications at (460, 200) in **top-left** coords —
  keep in sync with the `contents` in the maker config.
