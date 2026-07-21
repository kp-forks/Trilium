import type { NextFunction, Request, Response } from "express";

import config from "./config.js";
import { isInternalElectronRequest } from "./electron_request.js";
import { isElectron } from "./utils.js";

/**
 * Paths that stay reachable on the desktop's loopback listener even when the user
 * has NOT enabled network access. These are same-machine integrations rather than
 * the web app:
 *  - `/mcp` — the MCP transport, which additionally self-restricts to loopback with
 *    DNS-rebinding protection (see routes/mcp.ts), so it never reaches the LAN.
 *  - `/api/clipper` — the web clipper endpoint the browser extension talks to.
 *  - `/etapi` — the token-authenticated External API used by local automation.
 *
 * Everything else (the SPA + login, `/share`, the authenticated `/api`, static
 * assets) is "web access to the desktop instance" and is served only once the user
 * opts into network access.
 */
const LOCAL_INTEGRATION_PREFIXES = ["/mcp", "/api/clipper", "/etapi"];

export function isLocalIntegrationPath(path: string): boolean {
    return LOCAL_INTEGRATION_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Pure decision for {@link desktopNetworkAccessGate}, extracted so the branching is
 * unit-testable without a live Electron build (isElectron is a process constant).
 *
 * Blocks a request only when ALL hold: it's the desktop build, the user hasn't
 * enabled network access, it arrived over TCP (not from our own trilium-app://
 * renderer), and it targets something other than a localhost integration.
 */
export function shouldBlockDesktopWebRequest(opts: {
    isElectron: boolean;
    allowLanAccess: boolean;
    isInternal: boolean;
    path: string;
}): boolean {
    if (!opts.isElectron) {
        return false; // server build — web access is the whole point
    }
    if (opts.allowLanAccess) {
        return false; // opted into network access — serve everything
    }
    if (opts.isInternal) {
        return false; // our own renderer, dispatched in-process — never gated
    }
    return !isLocalIntegrationPath(opts.path);
}

/**
 * Gates web access to a desktop instance behind the network-access opt-in
 * (`allowLanAccess`). With it off, a browser (or any TCP client) reaching the
 * loopback listener can still use the localhost integrations but not the app or
 * shared notes. Mounted before the static/app/share routes; the renderer bypasses
 * it via the internal-electron marker.
 */
export function desktopNetworkAccessGate(req: Request, res: Response, next: NextFunction): void {
    const blocked = shouldBlockDesktopWebRequest({
        isElectron,
        allowLanAccess: config.Security?.allowLanAccess === true,
        isInternal: isInternalElectronRequest(req),
        path: req.path
    });

    if (blocked) {
        res.status(403).type("text/plain").send(
            'Web access to this Trilium desktop instance is disabled. Enable "Network access" in Settings → Security to reach it from a browser.'
        );
        return;
    }

    next();
}
