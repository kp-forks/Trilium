import { describe, expect, it, vi, beforeEach } from "vitest";

const createAnthropicMock = vi.fn();

vi.mock("@ai-sdk/anthropic", () => ({
    createAnthropic: (opts: unknown) => {
        createAnthropicMock(opts);
        const fn: any = () => ({});
        fn.tools = { webSearch_20250305: () => ({}) };
        return fn;
    }
}));

import { AnthropicProvider } from "./anthropic.js";

describe("AnthropicProvider construction", () => {
    beforeEach(() => {
        createAnthropicMock.mockClear();
    });

    it("forwards apiKey only when no baseURL provided", () => {
        new AnthropicProvider("sk-ant-test");
        expect(createAnthropicMock).toHaveBeenCalledTimes(1);
        expect(createAnthropicMock).toHaveBeenCalledWith({ apiKey: "sk-ant-test" });
    });

    it("forwards apiKey and baseURL when both provided", () => {
        new AnthropicProvider("sk-ant-test", "https://proxy.example.com/v1");
        expect(createAnthropicMock).toHaveBeenCalledWith({
            apiKey: "sk-ant-test",
            baseURL: "https://proxy.example.com/v1"
        });
    });

    it("omits baseURL when empty string is provided", () => {
        new AnthropicProvider("sk-ant-test", "");
        expect(createAnthropicMock).toHaveBeenCalledWith({ apiKey: "sk-ant-test" });
    });

    it("throws when apiKey is missing", () => {
        expect(() => new AnthropicProvider("")).toThrow(/API key is required/);
    });
});
