import { describe, expect, it } from "vitest";
import { CORE_PLUGINS, COMMON_PLUGINS, POPUP_EDITOR_PLUGINS, loadPremiumPlugins } from "./plugins.js";

describe("plugin lists", () => {
    it("CORE_PLUGINS is a non-empty array", () => {
        expect(Array.isArray(CORE_PLUGINS)).toBe(true);
        expect(CORE_PLUGINS.length).toBeGreaterThan(0);
    });

    it("COMMON_PLUGINS is a non-empty array", () => {
        expect(Array.isArray(COMMON_PLUGINS)).toBe(true);
        expect(COMMON_PLUGINS.length).toBeGreaterThan(0);
    });

    it("POPUP_EDITOR_PLUGINS is a non-empty array", () => {
        expect(Array.isArray(POPUP_EDITOR_PLUGINS)).toBe(true);
        expect(POPUP_EDITOR_PLUGINS.length).toBeGreaterThan(0);
    });

    it("COMMON_PLUGINS includes all CORE_PLUGINS", () => {
        for (const plugin of CORE_PLUGINS) {
            expect(COMMON_PLUGINS).toContain(plugin);
        }
    });

    it("POPUP_EDITOR_PLUGINS includes all COMMON_PLUGINS", () => {
        for (const plugin of COMMON_PLUGINS) {
            expect(POPUP_EDITOR_PLUGINS).toContain(plugin);
        }
    });

    it("all entries in CORE_PLUGINS are functions (plugin constructors)", () => {
        for (const plugin of CORE_PLUGINS) {
            expect(typeof plugin).toBe("function");
        }
    });

    it("all entries in COMMON_PLUGINS are functions (plugin constructors)", () => {
        for (const plugin of COMMON_PLUGINS) {
            expect(typeof plugin).toBe("function");
        }
    });

    it("all entries in POPUP_EDITOR_PLUGINS are functions (plugin constructors)", () => {
        for (const plugin of POPUP_EDITOR_PLUGINS) {
            expect(typeof plugin).toBe("function");
        }
    });
});

describe("loadPremiumPlugins", () => {
    it("returns a non-empty array of plugin constructors", async () => {
        const plugins = await loadPremiumPlugins();
        expect(Array.isArray(plugins)).toBe(true);
        expect(plugins.length).toBeGreaterThan(0);
        for (const plugin of plugins) {
            expect(typeof plugin).toBe("function");
        }
    });

    it("includes SlashCommand, Template, and FormatPainter", async () => {
        const { SlashCommand, Template, FormatPainter } = await import("ckeditor5-premium-features");
        const plugins = await loadPremiumPlugins();
        expect(plugins).toContain(SlashCommand);
        expect(plugins).toContain(Template);
        expect(plugins).toContain(FormatPainter);
    });
});
