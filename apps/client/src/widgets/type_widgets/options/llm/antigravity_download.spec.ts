import { describe, expect, it, vi } from "vitest";

import { findAntigravityDownload, registryPlatformKey } from "./antigravity_download";

/** The registry's agent.json for antigravity-acp 1.1.1, trimmed to two platforms. */
const ENTRY = {
    id: "antigravity-acp",
    version: "1.1.1",
    distribution: {
        binary: {
            "linux-x86_64": {
                archive: "https://dl.google.com/agy-extensions/releases/linux/agy-acp-server-agy_acp_server_1.1.1-linux-x86_64.zip",
                cmd: "./agy_acp_server.par"
            },
            "windows-aarch64": {
                archive: "https://example.com/agy_acp_server-windows-arm64.zip",
                cmd: "./agy_acp_server.exe"
            }
        }
    }
};

function respondWith(body: unknown, ok = true) {
    return vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body }) as Response);
}

describe("registryPlatformKey", () => {
    it("names the platforms the registry lists, and nothing else", () => {
        expect(registryPlatformKey("linux", "x64")).toBe("linux-x86_64");
        expect(registryPlatformKey("linux", "arm64")).toBe("linux-aarch64");
        expect(registryPlatformKey("darwin", "arm64")).toBe("darwin-aarch64");
        expect(registryPlatformKey("win32", "x64")).toBe("windows-x86_64");
        expect(registryPlatformKey("freebsd", "x64")).toBeUndefined();
        expect(registryPlatformKey("linux", "ia32")).toBeUndefined();
        // Standalone reports "web" and no architecture.
        expect(registryPlatformKey("web", undefined)).toBeUndefined();
    });
});

describe("findAntigravityDownload", () => {
    it("returns the archive the registry lists for the server's platform", async () => {
        const fetchMock = respondWith(ENTRY);
        await expect(findAntigravityDownload("linux", "x64", fetchMock)).resolves.toEqual({
            version: "1.1.1",
            url: "https://dl.google.com/agy-extensions/releases/linux/agy-acp-server-agy_acp_server_1.1.1-linux-x86_64.zip"
        });
        expect(fetchMock).toHaveBeenCalledWith(
            "https://raw.githubusercontent.com/agentclientprotocol/registry/main/antigravity-acp/agent.json",
            expect.anything()
        );
    });

    it("returns no link when there is none to trust", async () => {
        // A platform the registry has no name for is not looked up at all.
        const unnamed = respondWith(ENTRY);
        await expect(findAntigravityDownload("freebsd", "x64", unnamed)).resolves.toEqual({});
        expect(unnamed).not.toHaveBeenCalled();
        // Google builds nothing for Intel Macs.
        await expect(findAntigravityDownload("darwin", "x64", respondWith(ENTRY))).resolves.toEqual({});
        // Listed, but not on Google's download host.
        await expect(findAntigravityDownload("win32", "arm64", respondWith(ENTRY))).resolves.toEqual({});
        // The registry is unreachable or answers with an error.
        await expect(findAntigravityDownload("linux", "x64", vi.fn(async () => { throw new Error("offline"); }))).resolves.toEqual({});
        await expect(findAntigravityDownload("linux", "x64", respondWith(ENTRY, false))).resolves.toEqual({});
        // The entry changed shape.
        await expect(findAntigravityDownload("linux", "x64", respondWith({ version: "2.0.0" }))).resolves.toEqual({});
    });
});
