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

- `splash.html` is a deterministic frame source: `window.renderFrame(t)` computes every element's
  opacity/transform at absolute time `t` seconds (no CSS animations), so output is reproducible.
  `window.SPLASH_TIMELINE` is the `[{ t, delay }]` frame schedule. `?variant=nightly` switches to the
  purple palette and shows the NIGHTLY badge.
- `generate.mts` walks the timeline in headless Chromium (via the repo's `@playwright/test`),
  screenshots each frame, and encodes an animated GIF with `gifenc` — no external binaries needed.

## Timeline

- The reveal plays once (0–1.5 s at 10 fps), then a steady tail pulses the dots out to 20 s at 5 fps.
  The GIF loops, so the reveal replays every ~20 s — long enough that a normal install finishes during
  the first pass and effectively sees it once. Adjust `REVEAL_DURATION` / `LOOP_DURATION` /
  `STEADY_FPS` in `splash.html`.
- **Keep the frame count modest.** Squirrel's `Update.exe` renders the GIF with `WpfAnimatedGif`,
  which pre-decodes *every* frame to a full-size (640×480) bitmap held in memory, in a **32-bit**
  process (verified: `electron-winstaller`'s vendored `Squirrel.exe` is x86). Memory scales with
  frame count, not file size — ~1.2 MiB per frame. The current 108 frames ≈ 127 MiB; a 100 s / 1000-
  frame GIF would be ~1.2 GiB and risks an OutOfMemoryException. The low-fps steady tail exists to
  hold the count down.

## Framing

- The window has no chrome and no drop shadow (Squirrel's `Update.exe` is `WindowStyle.None` +
  transparent), and GIF's 1-bit transparency can't cast a soft shadow onto the desktop. So the splash
  is a **card on a tray**: an opaque light-neutral tray with a hairline edge, holding a rounded white
  card whose soft shadow falls on the tray. That gives a defined, elevated boundary against any
  surface — notably a white Explorer pane, where a plain white splash would vanish.

## Encoding

- Frames are **delta-encoded**: one global palette, and pixels unchanged from the previous frame are
  written as a transparent index over the kept canvas (`dispose: 1`). This shrinks the mostly-static
  steady tail to almost nothing (~140 KiB total). It saves file size only — not `Update.exe` memory,
  which re-expands every frame to full size regardless.
- The large flat colors (card white, tray, hairline, wordmark) are **pinned** into the palette:
  gifenc's `applyPalette` nearest-color search is approximate, so without pinning the big white card
  drifts to a warm near-white. `deriveAnchorColors()` reads these colors from the first rendered
  frame and forces any exact-match pixel to that palette index, so changing the tray/card tone in
  `splash.html` needs no change in the generator.

## Output contract

- 640 × 480, opaque; light-neutral tray (`#eceef1`) + white card. Transparency is used only for delta
  frames — frame 0 is a full opaque frame, so the loop resets cleanly with no reliance on desktop
  show-through. 108 frames, ~20 s loop, infinite loop, 255-color global palette, ~140 KiB.
- The mark and wordmark are drawn larger than strictly needed: Squirrel's `Update.exe` is not
  DPI-aware, so on a HiDPI display the window is bilinear-stretched by the display scale factor
  (e.g. 1.5×) and there is no way to signal density through a GIF. Bolder artwork survives that
  stretch better — it cannot be made pixel-sharp from our side.
- The leaf geometry and the nine stable fill colors are taken verbatim from the app icon
  (`icon-color.svg`); the nightly variant remaps each leaf to a purple ramp.
