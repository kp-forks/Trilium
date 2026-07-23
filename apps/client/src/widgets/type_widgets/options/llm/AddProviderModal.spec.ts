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

    it("sorts every card into a billing section, with the local one matching the self-hosted set", () => {
        // Groups follow the user guide's taxonomy: metered API keys, a fixed-fee
        // subscription reused from elsewhere, and self-hosted. `group` and
        // `baseUrl` are independent fields describing the same split for the local
        // set, so a card added to one and not the other would land in the wrong section.
        expect(PROVIDER_TYPES.filter(p => p.group === "cloud").map(p => p.id))
            .toEqual(["anthropic", "openai", "google"]);
        expect(PROVIDER_TYPES.filter(p => p.group === "subscription").map(p => p.id))
            .toEqual(["claude-agent"]);
        expect(PROVIDER_TYPES.filter(p => p.group === "local").map(p => p.id)).toEqual(SELF_HOSTED);
    });

    it("bills every subscription provider through an existing account rather than a key", () => {
        for (const card of PROVIDER_TYPES.filter(p => p.group === "subscription")) {
            expect(card.apiKey, `${card.id} should not ask for an API key`).toBe("none");
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

    it("gives every card a logo", () => {
        // SelectableCard is only passed `iconUrl`, so a card without one renders
        // with an empty icon slot rather than falling back to anything.
        for (const card of PROVIDER_TYPES) {
            expect(card.iconUrl, `no icon for ${card.id}`).toBeTruthy();
        }
    });
});
