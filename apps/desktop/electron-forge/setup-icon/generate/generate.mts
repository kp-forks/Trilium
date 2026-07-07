/**
 * Regenerates the Squirrel.Windows installer splash GIFs (setup-banner.gif and
 * setup-banner-dev.gif) from splash.html.
 *
 * Run with: pnpm --filter desktop generate-setup-banners
 *
 * Renders each frame deterministically via window.renderFrame(i) in headless
 * Chromium, then encodes an animated GIF with gifenc. Run on Windows so the
 * wordmark renders in Segoe UI, which is what the installer audience sees.
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
const MAX_COLORS = 128;

const VARIANTS = [
    { variant: "stable", fileName: "setup-banner.gif" },
    { variant: "nightly", fileName: "setup-banner-dev.gif" }
];

async function renderVariant(page: Page, variant: string): Promise<Buffer> {
    await page.goto(`${SPLASH_PAGE}?variant=${variant}`);
    const timeline = await page.evaluate(() => window.SPLASH_TIMELINE);

    const gif = GIFEncoder();
    for (let frame = 0; frame < timeline.totalFrames; frame++) {
        await page.evaluate((f) => window.renderFrame(f), frame);
        const screenshot = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } }));
        const rgba = new Uint8Array(screenshot.data.buffer, screenshot.data.byteOffset, screenshot.data.length);

        const palette = quantize(rgba, MAX_COLORS);
        const index = applyPalette(rgba, palette);
        gif.writeFrame(index, WIDTH, HEIGHT, {
            palette,
            delay: 1000 / timeline.fps,
            repeat: 0 // loop forever
        });
    }
    gif.finish();

    return Buffer.from(gif.bytes());
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
        SPLASH_TIMELINE: { fps: number; totalFrames: number };
        renderFrame: (frame: number) => void;
    }
}
