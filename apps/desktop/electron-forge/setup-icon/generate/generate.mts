/**
 * Regenerates the Squirrel.Windows installer splash GIFs (setup-banner.gif and
 * setup-banner-dev.gif) from splash.html.
 *
 * Run with: pnpm --filter desktop generate-setup-banners
 *
 * Renders each frame deterministically via window.renderFrame(t) in headless
 * Chromium, then encodes an animated GIF with gifenc. Run on Windows so the
 * wordmark renders in Segoe UI, which is what the installer audience sees.
 *
 * Frames are delta-encoded: a single global palette, and pixels unchanged from
 * the previous frame are written as a transparent index over the kept canvas
 * (dispose = 1). The static reveal costs full frames; the steady tail (only the
 * pulsing dots change) costs almost nothing, so the file stays small even at 20s.
 */
import { chromium, type Page } from "@playwright/test";
import { writeFileSync } from "fs";
import gifenc from "gifenc";
import path from "path";
import { PNG } from "pngjs";
import { fileURLToPath, pathToFileURL } from "url";

// gifenc's CJS build exposes no named ESM exports, hence the default import.
const { GIFEncoder, quantize, applyPalette } = gifenc;

const SETUP_ICON_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SPLASH_PAGE = pathToFileURL(path.join(SETUP_ICON_DIR, "generate", "splash.html"));

const WIDTH = 640;
const HEIGHT = 480;
// One color slot is reserved for transparency, so quantize to 255 (not 256).
const PALETTE_COLORS = 255;

const VARIANTS = [
    { variant: "stable", fileName: "setup-banner.gif" },
    { variant: "nightly", fileName: "setup-banner-dev.gif" }
];

async function renderVariant(page: Page, variant: string): Promise<Buffer> {
    await page.goto(`${SPLASH_PAGE}?variant=${variant}`);
    const timeline = await page.evaluate(() => window.SPLASH_TIMELINE);

    // Capture every frame's raw pixels up front; delta encoding needs to diff
    // consecutive frames and to build one palette covering all of them.
    const frames: Uint8Array[] = [];
    for (const { t } of timeline) {
        await page.evaluate((time) => window.renderFrame(time), t);
        const png = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } }));
        frames.push(new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length).slice());
    }

    const palette = buildGlobalPalette(frames);
    const transparentIndex = palette.length; // 255: unused by applyPalette (0..254)

    const gif = GIFEncoder();
    let previous: Uint8Array | null = null;
    for (const [i, { delay }] of timeline.entries()) {
        const rgba = frames[i];
        const index = applyPalette(rgba, palette);
        if (previous) {
            for (let p = 0; p < index.length; p++) {
                const b = p * 4;
                if (rgba[b] === previous[b] && rgba[b + 1] === previous[b + 1] && rgba[b + 2] === previous[b + 2]) {
                    index[p] = transparentIndex;
                }
            }
        }
        gif.writeFrame(index, WIDTH, HEIGHT, {
            palette: i === 0 ? palette : undefined, // global color table, written once
            first: i === 0,
            transparent: true,
            transparentIndex,
            dispose: 1, // keep the previous canvas so transparent pixels persist
            delay,
            repeat: 0 // loop forever
        });
        previous = rgba;
    }
    gif.finish();

    return Buffer.from(gif.bytes());
}

// Builds one palette shared by every frame (required for cross-frame transparency).
// Sampling a handful of frames across the timeline captures the reveal's partial
// leaves plus the steady tail's dot-pulse tints without quantizing all ~110 frames.
function buildGlobalPalette(frames: Uint8Array[]): number[][] {
    const count = Math.min(frames.length, 6);
    const step = Math.max(1, Math.floor(frames.length / count));
    const sampled: Uint8Array[] = [];
    for (let i = 0; i < frames.length; i += step) {
        sampled.push(frames[i]);
    }
    const merged = new Uint8Array(sampled.reduce((n, f) => n + f.length, 0));
    let offset = 0;
    for (const frame of sampled) {
        merged.set(frame, offset);
        offset += frame.length;
    }
    return quantize(merged, PALETTE_COLORS);
}

const browser = await chromium.launch();
try {
    const page = await browser.newPage({
        viewport: { width: WIDTH, height: HEIGHT },
        deviceScaleFactor: 1
    });

    for (const { variant, fileName } of VARIANTS) {
        const gif = await renderVariant(page, variant);
        const outputPath = path.join(SETUP_ICON_DIR, fileName);
        writeFileSync(outputPath, gif);
        console.log(`[${variant}] ${outputPath} (${(gif.length / 1024).toFixed(1)} KiB)`);
    }
} finally {
    await browser.close();
}

declare global {
    interface Window {
        SPLASH_TIMELINE: { t: number; delay: number }[];
        renderFrame: (t: number) => void;
    }
}
