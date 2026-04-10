import { describe, expect, it } from "vitest";
import { migrateSyncTimeoutFromMilliseconds } from "./options_init.js";

describe("migrateSyncTimeoutFromMilliseconds", () => {
    it("returns null when no migration is needed", () => {
        // Values < 1000 are already in seconds/minutes format
        expect(migrateSyncTimeoutFromMilliseconds(120)).toBeNull();
        expect(migrateSyncTimeoutFromMilliseconds(500)).toBeNull();
        expect(migrateSyncTimeoutFromMilliseconds(999)).toBeNull();
        expect(migrateSyncTimeoutFromMilliseconds(NaN)).toBeNull();
    });

    it("migrates to minutes when divisible by 60", () => {
        expect(migrateSyncTimeoutFromMilliseconds(60000)).toEqual({ value: 1, scale: 60 });   // 1 minute
        expect(migrateSyncTimeoutFromMilliseconds(120000)).toEqual({ value: 2, scale: 60 });  // 2 minutes
        expect(migrateSyncTimeoutFromMilliseconds(300000)).toEqual({ value: 5, scale: 60 });  // 5 minutes
        expect(migrateSyncTimeoutFromMilliseconds(3600000)).toEqual({ value: 60, scale: 60 }); // 60 minutes
    });

    it("migrates to seconds when not divisible by 60", () => {
        expect(migrateSyncTimeoutFromMilliseconds(1000)).toEqual({ value: 1, scale: 1 });    // 1 second
        expect(migrateSyncTimeoutFromMilliseconds(45000)).toEqual({ value: 45, scale: 1 });  // 45 seconds
        expect(migrateSyncTimeoutFromMilliseconds(90000)).toEqual({ value: 90, scale: 1 });  // 90 seconds
        expect(migrateSyncTimeoutFromMilliseconds(150000)).toEqual({ value: 150, scale: 1 }); // 150 seconds
    });

    it("rounds milliseconds to nearest second", () => {
        expect(migrateSyncTimeoutFromMilliseconds(120500)).toEqual({ value: 121, scale: 1 });
    });
});
