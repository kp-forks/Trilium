# Installer splash generation

`setup-banner.gif` and `setup-banner-dev.gif` (one directory up) are the splash screens shown by the
Squirrel.Windows installer while it extracts the app (`loadingGif` in `electron-forge/forge.config.ts`).
Squirrel only accepts GIF, shows it at native pixel size in a borderless window, and provides no
progress bar — the animation is the user's only feedback that the install is running.

Both files are generated from `splash.html` in this directory. Do not edit the GIFs by hand;
change the HTML/timeline and regenerate:

```bash
pnpm --filter desktop generate-setup-banners
```

Run it on **Windows** so the wordmark renders in Segoe UI (the font is rasterized into the GIF).

## How it works

- `splash.html` is a deterministic frame source: `window.renderFrame(i)` computes every element's
  opacity/transform for frame `i` (no CSS animations), so output is reproducible. `?variant=nightly`
  switches to the purple palette and shows the NIGHTLY badge.
- `generate.mts` steps through the timeline in headless Chromium (via the repo's `@playwright/test`),
  screenshots each frame, and encodes an animated GIF with `gifenc` — no external binaries needed.

## Output contract

- 640 × 480, opaque white background (GIF transparency is 1-bit and would leave ragged edges over
  the desktop), 36 frames at 100 ms (3.6 s loop), infinite loop, ≤ 128 colors per frame, ~250 KiB.
- The mark and wordmark are drawn larger than strictly needed: Squirrel's `Update.exe` is not
  DPI-aware, so on a HiDPI display the window is bilinear-stretched by the display scale factor
  (e.g. 1.5×) and there is no way to signal density through a GIF. Bolder artwork survives that
  stretch better — it cannot be made pixel-sharp from our side.
- The leaf geometry and the nine stable fill colors are taken verbatim from the app icon
  (`icon-color.svg`); the nightly variant remaps each leaf to a purple ramp.
- The dot pulse cycle (1.2 s) divides the loop length evenly so the pulse is continuous across the
  GIF loop point — keep that invariant if you change the timing.
