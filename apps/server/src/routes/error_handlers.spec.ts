import { describe, expect, it } from "vitest";

import { extractOAuthErrorDetail } from "./error_handlers.js";

describe("extractOAuthErrorDetail", () => {
    it("combines OAuth error code and description", () => {
        expect(extractOAuthErrorDetail({ error: "invalid_client", error_description: "Unauthorized" }))
            .toBe("invalid_client: Unauthorized");
    });

    it("returns whichever field is present on its own", () => {
        expect(extractOAuthErrorDetail({ error: "redirect_uri_mismatch" })).toBe("redirect_uri_mismatch");
        expect(extractOAuthErrorDetail({ error_description: "Bad Request" })).toBe("Bad Request");
    });

    it("returns null for errors without OAuth detail", () => {
        expect(extractOAuthErrorDetail(new Error("server responded with an error in the response body"))).toBeNull();
        expect(extractOAuthErrorDetail({ error: 42 })).toBeNull();
        expect(extractOAuthErrorDetail("just a string")).toBeNull();
        expect(extractOAuthErrorDetail(null)).toBeNull();
        expect(extractOAuthErrorDetail(undefined)).toBeNull();
    });
});
