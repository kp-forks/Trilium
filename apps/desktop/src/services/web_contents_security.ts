import { WEBVIEW_SESSION_PARTITION } from "@triliumnext/commons";
import { getLog } from "@triliumnext/core";
import electron from "electron";

/**
 * Security guard for `<webview>` attachment.
 *
 * Main and extra windows are created with `webviewTag: true` so the Web View
 * note type can embed remote pages. The webview tag is renderer-controlled
 * markup, which means a single XSS in the renderer could otherwise inject
 * `<webview nodeintegration src=...>` or attach a `preload` attribute and
 * regain the full Node.js access that `nodeIntegration: false` +
 * `contextIsolation: true` were introduced to remove.
 *
 * Per the Electron security checklist, `will-attach-webview` fires in the main
 * process before a guest is created and is the only reliable place to vet the
 * web preferences the embedder requested.
 */

/**
 * Registers a main-process hook that vets every `<webview>` before it
 * attaches, on every WebContents the app ever creates (main, extra, setup and
 * print windows alike).
 *
 * Attach attempts that explicitly request a dangerous capability (Node
 * integration, a preload script, disabled web security) are denied outright —
 * the legitimate Web View note type never requests any of them, so a
 * violation can only come from injected markup. Benign attaches proceed with
 * their preferences hardened as defense in depth.
 *
 * Call once during startup, before any window is created.
 */
export function setupWebContentsSecurity() {
    electron.app.on("web-contents-created", (_event, webContents) => {
        webContents.on("will-attach-webview", (attachEvent, webPreferences, params) => {
            // Depending on the Electron version the `partition` attribute
            // surfaces on `webPreferences` or only on the attach params, so
            // feed both into the check.
            const violations = hardenWebviewPreferences(webPreferences, params.partition);
            if (violations.length > 0) {
                attachEvent.preventDefault();
                getLog().error(`Blocked <webview> attach requesting [${violations.join(", ")}] for src: ${params.src}`);
            }
        });
    });
}

/**
 * Strips dangerous capabilities from the web preferences a `<webview>`
 * requested and returns the list of explicit violations found (empty for a
 * benign attach).
 *
 * `contextIsolation` and `sandbox` are forced on silently rather than
 * reported: Electron may legitimately pass them unset for guests, so they are
 * normalization, not evidence of hostile markup.
 */
export function hardenWebviewPreferences(webPreferences: Electron.WebPreferences, requestedPartition?: string): string[] {
    const violations: string[] = [];

    // `preloadURL` is the legacy alias of `preload`; Electron still honours it.
    const prefs = webPreferences as Electron.WebPreferences & { preloadURL?: string };
    if (prefs.preload !== undefined || prefs.preloadURL !== undefined) {
        violations.push("preload script");
    }
    delete prefs.preload;
    delete prefs.preloadURL;

    if (prefs.nodeIntegration) {
        violations.push("nodeIntegration");
    }
    if (prefs.nodeIntegrationInSubFrames) {
        violations.push("nodeIntegrationInSubFrames");
    }
    if (prefs.webSecurity === false) {
        violations.push("webSecurity disabled");
    }
    if (prefs.allowRunningInsecureContent) {
        violations.push("allowRunningInsecureContent");
    }
    // The only legitimate <webview> (the Web View note type) always declares
    // the dedicated guest partition. Explicitly requesting a different one is
    // hostile markup; omitting it would attach the guest into the *default*
    // session — shared cookie jar and trilium-app:// protocol registry — so
    // it is force-set below either way.
    const partition = prefs.partition ?? requestedPartition;
    if (partition !== undefined && partition !== WEBVIEW_SESSION_PARTITION) {
        violations.push(`partition '${partition}'`);
    }

    prefs.partition = WEBVIEW_SESSION_PARTITION;
    prefs.nodeIntegration = false;
    prefs.nodeIntegrationInSubFrames = false;
    prefs.webSecurity = true;
    prefs.allowRunningInsecureContent = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;

    return violations;
}
