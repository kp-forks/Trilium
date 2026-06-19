import { execSync } from "child_process";
import { isMac, isWindows } from "../../services/utils";
import { arch, cpus, networkInterfaces } from "os";

function systemChecks() {
    return {
        isCpuArchMismatch: isCpuArchMismatch()
    }
}

/**
 * Returns this host's non-internal network addresses. Consumed by the setup
 * "sync from desktop" screen so the user can see which addresses another device
 * should connect to. This lives server-side because the renderer can't reach
 * Node's `os` module (node integration is disabled in the Electron renderer).
 */
function getNetworkAddresses() {
    return {
        addresses: collectNetworkAddresses(networkInterfaces())
    };
}

/**
 * Detects if the application is running under emulation on Apple Silicon or Windows on ARM.
 * This happens when an x64 version of the app is run on an M1/M2/M3 Mac or on a Windows Snapdragon chip.
 * @returns true if running on x86 emulation on ARM, false otherwise.
 */
export const isCpuArchMismatch = () => {
    if (isMac) {
        try {
            // Use child_process to check sysctl.proc_translated
            // This is the proper way to detect Rosetta 2 translation
            const result = execSync("sysctl -n sysctl.proc_translated 2>/dev/null", {
                encoding: "utf8",
                timeout: 1000
            }).trim();

            // 1 means the process is being translated by Rosetta 2
            // 0 means native execution
            // If the sysctl doesn't exist (on Intel Macs), this will return empty/error
            return result === "1";
        } catch (error) {
            // If sysctl fails or doesn't exist (Intel Macs), not running under Rosetta 2
            return false;
        }
    } else if (isWindows && arch() === "x64") {
        return cpus().some(cpu =>
            cpu.model.includes('Microsoft SQ') ||
            cpu.model.includes('Snapdragon'));
    } else {
        return false;
    }
};

/**
 * Collects this host's non-internal network addresses, sorted by how likely
 * each is to be the reachable LAN address. Pure and exported so it can be
 * unit-tested without touching the real OS interfaces.
 */
export function collectNetworkAddresses(interfaces: ReturnType<typeof networkInterfaces>): string[] {
    const addresses: string[] = [];

    for (const nets of Object.values(interfaces)) {
        if (!nets) continue;
        for (const net of nets) {
            if (net.internal) continue;
            if (net.family === "IPv6" && net.scopeid !== 0) continue;
            addresses.push(net.address);
        }
    }

    addresses.sort((a, b) => networkScore(a) - networkScore(b));

    return addresses;
}

function networkScore(addr: string): number {
    if (addr.startsWith("192.168.")) return 0;
    if (addr.startsWith("10.")) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(addr)) return 2;
    if (addr.includes(":")) return 4; // IPv6
    return 3;
}

export default {
    systemChecks,
    getNetworkAddresses
};
