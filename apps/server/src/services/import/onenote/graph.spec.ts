import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../safe_fetch.js", () => ({ safeFetch: vi.fn() }));

import { safeFetch } from "../../safe_fetch.js";
import { backoffDelayMs, extractGraphErrorDetail, getAccount, getPageContent, getResource, listPages } from "./graph.js";

const safeFetchMock = vi.mocked(safeFetch);

/** Builds a Graph HTTP response as the mocked safeFetch returns it. */
function graphResponse(status: number, body: string): Awaited<ReturnType<typeof safeFetch>> {
    return new Response(body, { status }) as unknown as Awaited<ReturnType<typeof safeFetch>>;
}

describe("backoffDelayMs", () => {
    it("doubles the delay with each attempt", () => {
        expect(backoffDelayMs(0)).toBe(2000);
        expect(backoffDelayMs(1)).toBe(4000);
        expect(backoffDelayMs(2)).toBe(8000);
        expect(backoffDelayMs(3)).toBe(16000);
    });

    it("caps the delay at the maximum", () => {
        expect(backoffDelayMs(10)).toBe(30_000);
    });
});

describe("failed Graph requests", () => {
    afterEach(() => {
        safeFetchMock.mockReset();
    });

    it("reports status, Graph error detail and the failing URL for page content", async () => {
        safeFetchMock.mockResolvedValue(graphResponse(404, JSON.stringify({
            error: { code: "20102", message: "The specified resource ID does not exist." }
        })));

        await expect(getPageContent("token", "page-1")).rejects.toThrow(
            "Failed to fetch OneNote page content (HTTP 404: 20102: The specified resource ID does not exist.) "
            + "from https://graph.microsoft.com/v1.0/me/onenote/pages/page-1/content?includeInkML=true"
        );
    });

    it("omits the detail when the body is not a Graph error envelope (resource download)", async () => {
        safeFetchMock.mockResolvedValue(graphResponse(500, "<html>Internal Server Error</html>"));

        const url = "https://graph.microsoft.com/v1.0/me/onenote/resources/res-1/$value";
        await expect(getResource("token", url)).rejects.toThrow(
            `Failed to fetch OneNote resource (HTTP 500) from ${url}`
        );
    });

    it("reports the failing URL for a plain Graph GET", async () => {
        safeFetchMock.mockResolvedValue(graphResponse(403, JSON.stringify({
            error: { code: "AccessDenied", message: "Insufficient privileges." }
        })));

        await expect(getAccount("token")).rejects.toThrow(
            "Microsoft Graph request failed (HTTP 403: AccessDenied: Insufficient privileges.) "
            + "from https://graph.microsoft.com/v1.0/me"
        );
    });

    it("names the failing @odata.nextLink, not the original URL, when a follow-up page fails", async () => {
        // 410 rather than 429/503 so graphFetch fails immediately instead of entering backoff retries.
        const nextLink = "https://graph.microsoft.com/v1.0/me/onenote/sections/sec-1/pages?$skip=20";
        safeFetchMock
            .mockResolvedValueOnce(graphResponse(200, JSON.stringify({
                value: [{ id: "p1", title: "First" }],
                "@odata.nextLink": nextLink
            })))
            .mockResolvedValueOnce(graphResponse(410, JSON.stringify({ error: { code: "Gone" } })));

        await expect(listPages("token", "sec-1")).rejects.toThrow(
            `Microsoft Graph request failed (HTTP 410: Gone) from ${nextLink}`
        );
    });

    it("still reports status and URL when the error body cannot be read", async () => {
        safeFetchMock.mockResolvedValue({
            ok: false,
            status: 502,
            text: () => Promise.reject(new Error("connection reset"))
        } as unknown as Awaited<ReturnType<typeof safeFetch>>);

        const url = "https://graph.microsoft.com/v1.0/me/onenote/resources/res-2/$value";
        await expect(getResource("token", url)).rejects.toThrow(
            `Failed to fetch OneNote resource (HTTP 502) from ${url}`
        );
    });
});

describe("extractGraphErrorDetail", () => {
    it("extracts code and message from Graph's error envelope", () => {
        expect(extractGraphErrorDetail(JSON.stringify({ error: { code: "20102", message: "The specified resource ID does not exist." } })))
            .toBe("20102: The specified resource ID does not exist.");
        expect(extractGraphErrorDetail(JSON.stringify({ error: { message: "Something went wrong." } }))).toBe("Something went wrong.");
        expect(extractGraphErrorDetail(JSON.stringify({ error: { code: "ItemNotFound" } }))).toBe("ItemNotFound");
    });

    it("returns an empty string for bodies that are not a Graph error envelope", () => {
        expect(extractGraphErrorDetail("")).toBe("");
        expect(extractGraphErrorDetail("<html>Not Found</html>")).toBe("");
        expect(extractGraphErrorDetail("null")).toBe("");
        expect(extractGraphErrorDetail(JSON.stringify({ unrelated: true }))).toBe("");
    });
});
