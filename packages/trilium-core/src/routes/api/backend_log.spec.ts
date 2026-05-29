import { beforeAll, describe, expect, it } from "vitest";

import { CoreApiTester } from "../../test/api_tester";

/**
 * Drives the shared core backend-log route through {@link CoreApiTester} (no
 * Express), so this spec runs under both the node and standalone (WASM) suites.
 */
let api: CoreApiTester;

describe("Backend log API (core)", () => {
    beforeAll(() => {
        api = CoreApiTester.build();
    });

    it("returns the backend log contents as text", async () => {
        const res = await api.get<string>("/api/backend-log");
        expect(res.status).toBe(200);
        // The handler returns a plain string (the log contents, or a fallback
        // message when no log file is available); never assert on the exact text.
        expect(typeof res.body).toBe("string");
    });
});
