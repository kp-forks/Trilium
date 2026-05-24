import { beforeEach, describe, expect, it, vi } from "vitest";

let exposedApi: Record<string, Record<string, unknown>> = {};
let mockZoomFactor = 1.0;
const ipcRendererListeners = new Map<string, Function[]>();
const ipcRendererSent: Array<{ channel: string; args: unknown[] }> = [];

vi.mock("electron", () => ({
    contextBridge: {
        exposeInMainWorld(apiKey: string, api: Record<string, unknown>) {
            exposedApi[apiKey] = api;
        }
    },
    webFrame: {
        setZoomFactor(factor: number) {
            mockZoomFactor = factor;
        },
        getZoomFactor() {
            return mockZoomFactor;
        }
    },
    ipcRenderer: {
        on(channel: string, listener: Function) {
            const listeners = ipcRendererListeners.get(channel) ?? [];
            listeners.push(listener);
            ipcRendererListeners.set(channel, listeners);
        },
        send(channel: string, ...args: unknown[]) {
            ipcRendererSent.push({ channel, args });
        }
    }
}));

function getApi() {
    return exposedApi.electronApi as Record<string, Function>;
}

describe("preload script", () => {
    beforeEach(async () => {
        exposedApi = {};
        mockZoomFactor = 1.0;
        ipcRendererListeners.clear();
        ipcRendererSent.length = 0;
        vi.resetModules();
        await import("../src/preload.js");
    });

    it("exposes electronApi on the window", () => {
        expect(exposedApi).toHaveProperty("electronApi");
    });

    describe("zoom", () => {
        it("setZoomFactor delegates to webFrame", () => {
            getApi().setZoomFactor(1.5);
            expect(mockZoomFactor).toBe(1.5);
        });

        it("getZoomFactor delegates to webFrame", () => {
            mockZoomFactor = 0.8;
            expect(getApi().getZoomFactor()).toBe(0.8);
        });
    });

    describe("IPC listeners", () => {
        it("onGlobalShortcut registers and forwards globalShortcut channel", () => {
            const callback = vi.fn();
            getApi().onGlobalShortcut(callback);

            const listeners = ipcRendererListeners.get("globalShortcut")!;
            expect(listeners).toHaveLength(1);
            listeners[0]({}, "toggleNoteHoisting");
            expect(callback).toHaveBeenCalledWith("toggleNoteHoisting");
        });

        it("onOpenInSameTab registers and forwards openInSameTab channel", () => {
            const callback = vi.fn();
            getApi().onOpenInSameTab(callback);

            const listeners = ipcRendererListeners.get("openInSameTab")!;
            expect(listeners).toHaveLength(1);
            listeners[0]({}, "abc123");
            expect(callback).toHaveBeenCalledWith("abc123");
        });

        it("onEnterFullScreen registers and forwards enter-full-screen channel", () => {
            const callback = vi.fn();
            getApi().onEnterFullScreen(callback);

            const listeners = ipcRendererListeners.get("enter-full-screen")!;
            expect(listeners).toHaveLength(1);
            listeners[0]();
            expect(callback).toHaveBeenCalled();
        });

        it("onLeaveFullScreen registers and forwards leave-full-screen channel", () => {
            const callback = vi.fn();
            getApi().onLeaveFullScreen(callback);

            const listeners = ipcRendererListeners.get("leave-full-screen")!;
            expect(listeners).toHaveLength(1);
            listeners[0]();
            expect(callback).toHaveBeenCalled();
        });
    });

    describe("window management IPC senders", () => {
        it("setTitleBarOverlay sends correct IPC message", () => {
            getApi().setTitleBarOverlay({ color: "#fff", symbolColor: "#000" });
            expect(ipcRendererSent).toContainEqual({
                channel: "set-title-bar-overlay",
                args: [{ color: "#fff", symbolColor: "#000" }]
            });
        });

        it("setWindowButtonPosition sends correct IPC message", () => {
            getApi().setWindowButtonPosition({ x: 10, y: 20 });
            expect(ipcRendererSent).toContainEqual({
                channel: "set-window-button-position",
                args: [{ x: 10, y: 20 }]
            });
        });

        it("setBackgroundMaterial sends correct IPC message", () => {
            getApi().setBackgroundMaterial("mica");
            expect(ipcRendererSent).toContainEqual({
                channel: "set-background-material",
                args: ["mica"]
            });
        });

        it("setVibrancy sends correct IPC message", () => {
            getApi().setVibrancy("under-window");
            expect(ipcRendererSent).toContainEqual({
                channel: "set-vibrancy",
                args: ["under-window"]
            });
        });

        it("clearNavigationHistory sends correct IPC message", () => {
            getApi().clearNavigationHistory();
            expect(ipcRendererSent).toContainEqual({
                channel: "clear-navigation-history",
                args: []
            });
        });

        it("setNativeThemeSource sends correct IPC message", () => {
            getApi().setNativeThemeSource("dark");
            expect(ipcRendererSent).toContainEqual({
                channel: "set-native-theme-source",
                args: ["dark"]
            });
        });
    });
});
