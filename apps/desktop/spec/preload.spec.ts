import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the electron module before importing the preload script.
let exposedApi: Record<string, unknown> = {};
let mockZoomFactor = 1.0;

vi.mock("electron", () => ({
    contextBridge: {
        exposeInMainWorld(apiKey: string, api: Record<string, unknown>) {
            exposedApi = { [apiKey]: api };
        }
    },
    webFrame: {
        setZoomFactor(factor: number) {
            mockZoomFactor = factor;
        },
        getZoomFactor() {
            return mockZoomFactor;
        }
    }
}));

describe("preload script", () => {
    beforeEach(async () => {
        exposedApi = {};
        mockZoomFactor = 1.0;

        // Re-import to trigger contextBridge.exposeInMainWorld.
        vi.resetModules();
        await import("../src/preload.js");
    });

    it("exposes electronApi on the window", () => {
        expect(exposedApi).toHaveProperty("electronApi");
    });

    it("electronApi.setZoomFactor delegates to webFrame", () => {
        const api = exposedApi.electronApi as { setZoomFactor(f: number): void };
        api.setZoomFactor(1.5);
        expect(mockZoomFactor).toBe(1.5);
    });

    it("electronApi.getZoomFactor delegates to webFrame", () => {
        mockZoomFactor = 0.8;
        const api = exposedApi.electronApi as { getZoomFactor(): number };
        expect(api.getZoomFactor()).toBe(0.8);
    });
});
