import { WEBVIEW_SESSION_PARTITION } from "@triliumnext/commons";
import { getLog } from "@triliumnext/core";
import electron from "electron";
import url from "url";

import { validateOpenExternalUrl } from "./shell.js";

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
 * Registers a main-process hook that applies a uniform security policy to
 * every WebContents the app ever creates (main, extra, setup and print
 * windows as well as `<webview>` guests):
 *
 * - vets every `<webview>` before it attaches,
 * - denies all window-open requests, routing allowlisted URLs to the OS
 *   browser instead,
 * - blocks navigation away from the app shell,
 * - installs deny-by-default permission handlers on both the app session and
 *   the dedicated `<webview>` guest session.
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

        installWindowOpenPolicy(webContents);
        installNavigationGuard(webContents);
    });

    // Sessions only exist once the app is ready; both handlers below replace
    // Electron's default behaviour of granting every permission request.
    electron.app.whenReady().then(() => {
        installPermissionPolicy(electron.session.defaultSession, "app");
        installPermissionPolicy(electron.session.fromPartition(WEBVIEW_SESSION_PARTITION), "guest");
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

/**
 * Permission allowlists per session kind. Unset handlers make Electron GRANT
 * every request, so anything not listed here (camera, microphone, geolocation,
 * notifications, MIDI, HID, serial, USB, pointer lock, clipboard read, …) is
 * denied.
 *
 * - `app`: the default session — the Trilium renderer itself. It legitimately
 *   writes to the clipboard (copy note content/links), toggles fullscreen
 *   (e.g. presentations, zen mode) and shows notifications (user scripts
 *   commonly call `new Notification()` for reminders; the renderer only runs
 *   trusted code, so this stays available to the scripting ecosystem).
 * - `guest`: the `<webview>` partition hosting arbitrary remote pages from
 *   Web View notes. Fullscreen only (embedded video players) — a remote page
 *   must not show OS notifications that appear to come from Trilium.
 */
const PERMISSION_ALLOWLIST = {
    app: new Set(["clipboard-sanitized-write", "fullscreen", "notifications"]),
    guest: new Set(["fullscreen"])
} as const;

export type SessionKind = keyof typeof PERMISSION_ALLOWLIST;

/** Pure policy check: is `permission` allowed for the given session kind? */
export function isPermissionAllowed(kind: SessionKind, permission: string): boolean {
    return PERMISSION_ALLOWLIST[kind].has(permission);
}

/**
 * Decides whether a renderer-initiated navigation (link click, drag & drop,
 * meta refresh) may proceed. Only the app shell itself is allowed: the
 * `trilium-app://app` origin (the sole host ever served — see the loadURL
 * call sites) or localhost, and only at the root path — internal redirects
 * from the setup and migration pages land there. Anything deeper is in-page
 * SPA routing (which `will-navigate` does not fire for) or hostile.
 */
export function isNavigationAllowed(targetUrl: string): boolean {
    const parsedUrl = url.parse(targetUrl);

    const isInternal = (parsedUrl.protocol === "trilium-app:" && parsedUrl.hostname === "app")
        || ["localhost", "127.0.0.1"].includes(parsedUrl.hostname || "");
    return isInternal && (!parsedUrl.path || parsedUrl.path === "/" || parsedUrl.path === "/?");
}

/**
 * Denies every window-open request (`window.open`, `target=_blank`). For app
 * windows the URL is routed to the OS browser instead, after passing the same
 * scheme allowlist as the open-external IPC channel — a link in note content
 * is just as attacker-controllable as an IPC payload, so Follina-class
 * (`ms-msdt:`) and credential-leak (`smb:`) URLs must not bypass it here.
 *
 * `<webview>` guests are denied without the external dispatch: the tag never
 * sets `allowpopups`, so popups are already impossible there — this keeps it
 * that way even if a future Electron version changes the default, and stops
 * remote pages from triggering OS protocol handlers.
 */
function installWindowOpenPolicy(webContents: Electron.WebContents) {
    webContents.setWindowOpenHandler((details) => {
        if (webContents.getType() === "webview") {
            getLog().error(`Blocked window.open from <webview> guest for URL: ${details.url}`);
            return { action: "deny" };
        }

        async function openExternal() {
            const validated = validateOpenExternalUrl(details.url);
            await electron.shell.openExternal(validated.toString());
        }

        openExternal().catch(err => {
            getLog().error(`Failed to open external URL ${details.url}: ${err}`);
        });
        return { action: "deny" };
    });
}

/**
 * Prevents drag & drop, link clicks etc. from navigating an app window away
 * from Trilium. `<webview>` guests are exempt — they are embedded browsers
 * the user navigates freely. Main-process `loadURL` calls are unaffected
 * (`will-navigate` does not fire for them).
 */
function installNavigationGuard(webContents: Electron.WebContents) {
    if (webContents.getType() === "webview") {
        return;
    }

    webContents.on("will-navigate", (ev, targetUrl) => {
        if (!isNavigationAllowed(targetUrl)) {
            ev.preventDefault();
        }
    });
}

function installPermissionPolicy(session: Electron.Session, kind: SessionKind) {
    // Asynchronous requests (e.g. getUserMedia prompting for the camera).
    session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
        const allowed = isPermissionAllowed(kind, permission);
        if (!allowed) {
            getLog().error(`Denied '${permission}' permission request from ${details.requestingUrl} (${kind} session)`);
        }
        callback(allowed);
    });
    // Synchronous checks (e.g. navigator.permissions.query, push subscription
    // state) — without this handler Electron reports everything as granted.
    session.setPermissionCheckHandler((_webContents, permission) => isPermissionAllowed(kind, permission));
}
