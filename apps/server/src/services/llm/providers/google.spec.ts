import { describe, expect, it, vi, beforeEach } from "vitest";

const createGoogleMock = vi.fn();

vi.mock("@ai-sdk/google", () => ({
    createGoogleGenerativeAI: (opts: unknown) => {
        createGoogleMock(opts);
        const fn: any = () => ({});
        fn.tools = { googleSearch: () => ({}) };
        return fn;
    }
}));

import { GoogleProvider } from "./google.js";

describe("GoogleProvider construction", () => {
    beforeEach(() => {
        createGoogleMock.mockClear();
    });

    it("forwards apiKey only when no baseURL provided", () => {
        new GoogleProvider("test-key");
        expect(createGoogleMock).toHaveBeenCalledTimes(1);
        expect(createGoogleMock).toHaveBeenCalledWith({ apiKey: "test-key" });
    });

    it("forwards apiKey and baseURL when both provided", () => {
        new GoogleProvider("test-key", "https://proxy.example.com/v1beta");
        expect(createGoogleMock).toHaveBeenCalledWith({
            apiKey: "test-key",
            baseURL: "https://proxy.example.com/v1beta"
        });
    });

    it("omits baseURL when empty string is provided", () => {
        new GoogleProvider("test-key", "");
        expect(createGoogleMock).toHaveBeenCalledWith({ apiKey: "test-key" });
    });

    it("throws when apiKey is missing", () => {
        expect(() => new GoogleProvider("")).toThrow(/API key is required/);
    });
});
