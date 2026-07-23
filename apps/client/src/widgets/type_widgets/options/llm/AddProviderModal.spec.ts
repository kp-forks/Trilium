import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../services/i18n", () => ({ t: (key: string) => key }));

import { prefilledBaseUrl, PROVIDER_TYPES } from "./AddProviderModal";

/** Card ids are persisted in the llmProviders option, so they double as an API. */
const SELF_HOSTED = ["ollama", "lmstudio", "openai-compatible"];

describe("AddProviderModal provider cards", () => {
    it("prefills an endpoint for self-hosted providers only", () => {
        // The port is the one detail a self-hosted user must get right, and it
        // differs per runtime — whereas prefilling a vendor endpoint would store
        // a redundant override on every provider the user adds.
        expect(prefilledBaseUrl("ollama")).toBe("http://localhost:11434");
        expect(prefilledBaseUrl("lmstudio")).toBe("http://localhost:1234/v1");
        expect(prefilledBaseUrl("openai")).toBe("");
        expect(prefilledBaseUrl("anthropic")).toBe("");
        expect(prefilledBaseUrl("claude-agent")).toBe("");
        // The generic card has no single sensible endpoint to guess.
        expect(prefilledBaseUrl("openai-compatible")).toBe("");
        expect(prefilledBaseUrl("unknown")).toBe("");
    });

    it("declares an endpoint and a setup hint for every self-hosted card", () => {
        for (const id of SELF_HOSTED) {
            const card = PROVIDER_TYPES.find(p => p.id === id);
            expect(card, `missing card: ${id}`).toBeDefined();
            expect(card?.baseUrl).toBe("required");
            expect(card?.setupHintKey).toBeTruthy();
            expect(card?.defaultBaseUrl).toBeTruthy();
        }
    });

    it("keeps vendor cards on a required key and an advanced endpoint override", () => {
        for (const id of ["anthropic", "openai", "google"]) {
            const card = PROVIDER_TYPES.find(p => p.id === id);
            // Both default, so neither is set explicitly.
            expect(card?.apiKey ?? "required").toBe("required");
            expect(card?.baseUrl ?? "advanced").toBe("advanced");
        }
    });

    it("asks for no key from local runtimes and an optional one from arbitrary endpoints", () => {
        const byId = new Map(PROVIDER_TYPES.map(p => [p.id, p]));
        expect(byId.get("ollama")?.apiKey).toBe("none");
        expect(byId.get("lmstudio")?.apiKey).toBe("none");
        // A generic endpoint may sit behind an authenticating proxy (vLLM, LiteLLM).
        expect(byId.get("openai-compatible")?.apiKey).toBe("optional");
        // Subscription auth belongs to Claude Code itself.
        expect(byId.get("claude-agent")?.apiKey).toBe("none");
        expect(byId.get("claude-agent")?.baseUrl).toBe("none");
    });

    it("gives every card an icon of some kind", () => {
        for (const card of PROVIDER_TYPES) {
            expect(card.iconUrl ?? card.icon, `no icon for ${card.id}`).toBeTruthy();
        }
    });
});
