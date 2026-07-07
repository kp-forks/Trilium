/**
 * Renders preview.png — an illustration of the assembled DMG window, compositing the
 * real app icon and a stand-in Applications folder onto background.png at the same
 * `contents` coordinates used in forge.config.ts.
 *
 * This is documentation only: appdmg never sees it (it uses background.png/@2x). It
 * exists so the "what the DMG looks like" reference is reproducible from source rather
 * than a mystery committed image. Regenerate with: pnpm --filter desktop generate-dmg-preview
 */
import { unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { chromium } from "@playwright/test";

const DMG_DIR = path.dirname(fileURLToPath(import.meta.url));
const WIDTH = 640;
const HEIGHT = 400;
const ICON = 128;

// Icon CENTERS (top-left origin here) matching forge.config's bottom-left contents:
// app (180, 185 from bottom) -> 215 from top; same for Applications at x = 460.
const bg = pathToFileURL(path.join(DMG_DIR, "background.png")).href;
const appIcon = pathToFileURL(path.join(DMG_DIR, "..", "app-icon", "mac", "128x128.png")).href;
const at = (cx) => `left:${cx - ICON / 2}px;top:${215 - ICON / 2}px;width:${ICON}px;height:${ICON}px`;

const folder = `<svg viewBox="0 0 116 92" width="112" height="89">
  <defs>
    <linearGradient id="fb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#57a7e8"/><stop offset="1" stop-color="#3f8ed6"/></linearGradient>
    <linearGradient id="ff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fcbf5"/><stop offset="1" stop-color="#63b0ee"/></linearGradient>
  </defs>
  <path fill="url(#fb)" d="M12 8 h32 l8 8 h52 a12 12 0 0 1 12 12 v52 a12 12 0 0 1 -12 12 H12 a12 12 0 0 1 -12 -12 V20 a12 12 0 0 1 12 -12 z"/>
  <path fill="url(#ff)" d="M0 36 h116 v44 a12 12 0 0 1 -12 12 H12 a12 12 0 0 1 -12 -12 z"/>
</svg>`;

const html = `<body style="margin:0"><div style="position:relative;width:${WIDTH}px;height:${HEIGHT}px">
    <img src="${bg}" style="position:absolute;inset:0;width:${WIDTH}px;height:${HEIGHT}px">
    <img src="${appIcon}" style="position:absolute;${at(180)}">
    <div style="position:absolute;${at(460)};display:flex;align-items:center;justify-content:center">${folder}</div>
</div></body>`;

const tmpHtml = path.join(tmpdir(), "trilium-dmg-preview.html");
writeFileSync(tmpHtml, html);

const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(tmpHtml).href);
    const outputPath = path.join(DMG_DIR, "preview.png");
    await page.screenshot({ path: outputPath, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    console.log(outputPath);
} finally {
    await browser.close();
    unlinkSync(tmpHtml);
}
