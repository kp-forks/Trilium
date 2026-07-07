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
  Finder's light/dark mode — but as a full dark surface it reads fine either way.

## Design

- Reuses the installer splash's brand language: the same dark surface and a soft glow tinted from the
  trillium's three leaves (green/orange/red — purple for nightly). The drag arrow is a muted neutral
  grey, kept quiet so it doesn't compete with the icons.
- The two subtle "tiles" mark where Finder drops the real icons (app on the left, `/Applications`
  alias on the right). Each tile is tall enough (156 × 178) to hold its 128 px icon *and* the caption
  Finder draws beneath it, so the caption lands on the flat face rather than tucking under the rounded
  bottom corners. The icon **centers** must line up with the `contents` coordinates in `forge.config.ts`.
  Those coordinates use a **top-left** origin, y increasing downward, with `(x, y)` being the icon center
  — Finder's `.DS_Store` `Iloc` convention (confirmed by appdmg's own example, where `y: 344` sits near
  the *bottom* of the window). So the `contents` y is measured from the top, not `windowHeight - y`. The
  tiles span **y 122..300**; `contents` uses **y = 200**, seating the icon in the upper part with the
  caption in the lower third.
- **No baked text beyond the "Trilium Notes" wordmark** (a brand name, not translated). The DMG ships
  one image for every locale, so there is no localized instruction line — the arrow conveys the action,
  and Finder draws the app name and "Applications" labels under the real icons.

## Output contract

- 640 × 400 pt window; `background.png` is 640 × 400, `background@2x.png` is 1280 × 800.
- `iconSize` 128; app icon centered at (180, 200), Applications at (460, 200) in **top-left** coords,
  seated in the tiles in `background.html` (156 × 178, spanning y 122..300) — keep these in sync with the
  tile positions in `background.html` and the `contents` in the maker config.
