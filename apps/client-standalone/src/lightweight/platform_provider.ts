import type { PlatformProvider } from "@triliumnext/core";

export default class StandalonePlatformProvider implements PlatformProvider {
    crash(message: string): void {
        console.error("[Standalone] FATAL:", message);
        self.postMessage({
            type: "FATAL_ERROR",
            message
        });
    }
}
