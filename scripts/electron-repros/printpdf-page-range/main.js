const { app, BrowserWindow, ipcMain } = require("electron");

let mainWindow;

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });
    mainWindow.loadFile("index.html");
});

ipcMain.handle("print-test", async (_e, { pageRanges, step }) => {
    const printWindow = new BrowserWindow({
        show: false,
        width: 1,
        height: 1,
        webPreferences: { offscreen: process.platform !== "linux" },
    });

    await printWindow.loadFile("print-page.html");

    // Wait for content to be ready.
    await printWindow.webContents.executeJavaScript(
        `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`
    );

    const opts = {
        landscape: false,
        pageSize: "A4",
        scale: 1,
        printBackground: true,
        // Only include pageRanges if truthy (non-empty string).
        ...(pageRanges ? { pageRanges } : {}),
    };

    console.log(`[Step ${step}] printToPDF called with:`, JSON.stringify(opts));

    try {
        const buffer = await printWindow.webContents.printToPDF(opts);
        console.log(`[Step ${step}] SUCCESS - buffer size: ${buffer.length}`);
        printWindow.destroy();
        return { ok: true, size: buffer.length };
    } catch (err) {
        console.error(`[Step ${step}] FAILED: ${err.message}`);
        printWindow.destroy();
        return { ok: false, error: err.message };
    }
});
