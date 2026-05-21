import type { LlmMessage } from "@triliumnext/commons";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createAnthropicMock = vi.fn();

vi.mock("@ai-sdk/anthropic", () => ({
    createAnthropic: (opts: unknown) => {
        createAnthropicMock(opts);
        const fn: any = () => ({});
        fn.tools = { webSearch_20250305: () => ({}) };
        return fn;
    }
}));

const { streamTextMock } = vi.hoisted(() => ({
    streamTextMock: vi.fn((..._args: any[]) => ({}) as any)
}));

vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return { ...actual, streamText: streamTextMock };
});

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

describe("AnthropicProvider message building", () => {
    beforeEach(() => {
        streamTextMock.mockClear();
    });

    it("buildSystemMessage returns a system message with an ephemeral cache breakpoint", () => {
        const provider = new AnthropicProvider("sk-ant-test") as any;

        expect(provider.buildSystemMessage("You are helpful.")).toEqual({
            role: "system",
            content: "You are helpful.",
            providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }
        });
        expect(provider.buildSystemMessage(undefined)).toBeUndefined();
        expect(provider.buildSystemMessage("")).toBeUndefined();
    });

    it("buildMessages emits only user/assistant turns, never a system role", () => {
        const provider = new AnthropicProvider("sk-ant-test") as any;
        const messages: LlmMessage[] = [
            { role: "user", content: "hi" },
            { role: "assistant", content: "" },
            { role: "user", content: "bye" }
        ];

        const built = provider.buildMessages(messages);

        expect(built.map((m: any) => m.role)).toEqual(["user", "assistant", "user"]);
        // Anthropic rejects empty content blocks — empty turns get a placeholder.
        expect(built[1].content).toBe("(tool use)");
    });

    it("chat() routes the system prompt into the `system` option and forbids system messages in `messages`", () => {
        const provider = new AnthropicProvider("sk-ant-test");
        provider.chat(
            [
                { role: "system", content: "BASE PROMPT" },
                { role: "user", content: "hello" }
            ],
            {}
        );

        expect(streamTextMock).toHaveBeenCalledOnce();
        const opts = streamTextMock.mock.calls[0][0] as any;

        expect(opts.allowSystemInMessages).toBe(false);
        expect(opts.messages.every((m: any) => m.role !== "system")).toBe(true);
        expect(opts.system.role).toBe("system");
        expect(opts.system.content).toContain("BASE PROMPT");
        expect(opts.system.providerOptions).toEqual({
            anthropic: { cacheControl: { type: "ephemeral" } }
        });
    });

    it("chat() with extended thinking also guards against system messages in `messages`", () => {
        const provider = new AnthropicProvider("sk-ant-test");
        provider.chat(
            [
                { role: "system", content: "BASE PROMPT" },
                { role: "user", content: "hello" }
            ],
            { enableExtendedThinking: true }
        );

        const opts = streamTextMock.mock.calls[0][0] as any;

        expect(opts.allowSystemInMessages).toBe(false);
        expect(opts.messages.every((m: any) => m.role !== "system")).toBe(true);
        expect(opts.system.role).toBe("system");
        expect(opts.system.content).toContain("BASE PROMPT");
    });
});
