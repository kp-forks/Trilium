import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    isMac: false,
    isWindows: false,
    arch: "x64",
    cpuModel: "Intel",
    execResult: "0",
    execThrows: false
}));

vi.mock("../../services/utils", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../services/utils.js")>()),
    get isMac() { return state.isMac; },
    get isWindows() { return state.isWindows; }
}));

vi.mock("child_process", () => ({
    execSync: () => {
        if (state.execThrows) throw new Error("sysctl missing");
        return state.execResult;
    }
}));

vi.mock("os", () => ({
    arch: () => state.arch,
    cpus: () => [{ model: state.cpuModel }],
    networkInterfaces: () => ({})
}));

import systemInfoRoute, { collectNetworkAddresses, isCpuArchMismatch } from "./system_info.js";

type NetworkInterfaces = Parameters<typeof collectNetworkAddresses>[0];

describe("System info API", () => {
    afterEach(() => {
        Object.assign(state, { isMac: false, isWindows: false, arch: "x64", cpuModel: "Intel", execResult: "0", execThrows: false });
    });

    it("reports no mismatch on a native (non-mac, non-windows) platform", () => {
        expect(systemInfoRoute.systemChecks()).toEqual({ isCpuArchMismatch: false });
    });

    it("detects Rosetta 2 translation on macOS", () => {
        state.isMac = true;
        state.execResult = "1";
        expect(isCpuArchMismatch()).toBe(true);

        state.execResult = "0";
        expect(isCpuArchMismatch()).toBe(false);
    });

    it("treats a failing sysctl on macOS as native", () => {
        state.isMac = true;
        state.execThrows = true;
        expect(isCpuArchMismatch()).toBe(false);
    });

    it("detects ARM emulation on Windows x64", () => {
        state.isWindows = true;
        state.arch = "x64";
        state.cpuModel = "Snapdragon (TM) 8cx";
        expect(isCpuArchMismatch()).toBe(true);

        state.cpuModel = "Intel";
        expect(isCpuArchMismatch()).toBe(false);
    });

    describe("collectNetworkAddresses", () => {
        it("drops internal and scope-bound IPv6 addresses, then sorts by LAN likelihood", () => {
            const interfaces = {
                lo: [{ address: "127.0.0.1", internal: true, family: "IPv4" }],
                eth0: [
                    { address: "203.0.113.5", internal: false, family: "IPv4" },
                    { address: "192.168.1.20", internal: false, family: "IPv4" },
                    { address: "10.0.0.4", internal: false, family: "IPv4" },
                    { address: "fe80::1", internal: false, family: "IPv6", scopeid: 4 },
                    { address: "fd00::1", internal: false, family: "IPv6", scopeid: 0 }
                ]
            } as unknown as NetworkInterfaces;

            expect(collectNetworkAddresses(interfaces)).toEqual([
                "192.168.1.20", // 192.168.* ranks first
                "10.0.0.4",     // then 10.*
                "203.0.113.5",  // then other IPv4
                "fd00::1"       // IPv6 last; fe80::1 dropped (scopeid !== 0)
            ]);
        });

        it("returns an empty list when no usable interfaces exist", () => {
            expect(collectNetworkAddresses({})).toEqual([]);
            expect(collectNetworkAddresses({ lo: undefined } as unknown as NetworkInterfaces)).toEqual([]);
        });
    });
});
