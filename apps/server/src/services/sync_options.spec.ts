import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the dependencies before importing the module
vi.mock("./config.js", () => ({ default: { Sync: {} } }));
vi.mock("./options.js", () => ({ default: { getOption: vi.fn() } }));

import config from "./config.js";
import optionService from "./options.js";
import syncOptions from "./sync_options.js";

describe("syncOptions.getSyncTimeout", () => {
    beforeEach(() => {
        // Reset config to empty
        (config as any).Sync = {};
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("uses database value × scale when no config override", () => {
        vi.mocked(optionService.getOption).mockImplementation((name: string) => {
            if (name === "syncServerTimeout") return "2";
            if (name === "syncServerTimeoutTimeScale") return "60";
            return "";
        });

        expect(syncOptions.getSyncTimeout()).toBe(120000); // 2 × 60 × 1000 = 2 minutes
    });

    it("supports different time scales from database", () => {
        // 30 seconds
        vi.mocked(optionService.getOption).mockImplementation((name: string) => {
            if (name === "syncServerTimeout") return "30";
            if (name === "syncServerTimeoutTimeScale") return "1";
            return "";
        });
        expect(syncOptions.getSyncTimeout()).toBe(30000);

        // 1 hour
        vi.mocked(optionService.getOption).mockImplementation((name: string) => {
            if (name === "syncServerTimeout") return "1";
            if (name === "syncServerTimeoutTimeScale") return "3600";
            return "";
        });
        expect(syncOptions.getSyncTimeout()).toBe(3600000);
    });

    it("treats config override as raw milliseconds (ignores db scale)", () => {
        (config as any).Sync = { syncServerTimeout: "60000" };

        // Even if db has a different scale, config value is treated as raw ms
        vi.mocked(optionService.getOption).mockImplementation((name: string) => {
            if (name === "syncServerTimeout") return "5";
            if (name === "syncServerTimeoutTimeScale") return "3600"; // hours
            return "";
        });

        expect(syncOptions.getSyncTimeout()).toBe(60000); // 60 seconds, not 5 hours
    });

    it("uses safe defaults for invalid database values", () => {
        vi.mocked(optionService.getOption).mockImplementation(() => "");

        // Defaults: value=2, scale=60 → 120000ms
        expect(syncOptions.getSyncTimeout()).toBe(120000);
    });

    it("uses safe default for invalid config override", () => {
        (config as any).Sync = { syncServerTimeout: "invalid" };

        expect(syncOptions.getSyncTimeout()).toBe(120000); // fallback to 120000
    });
});
