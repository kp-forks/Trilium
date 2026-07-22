import type { LlmModelInfo } from "@triliumnext/commons";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchProviderModelsMock = vi.hoisted(() => vi.fn());
vi.mock("../../../../services/llm_chat", () => ({
    fetchProviderModels: fetchProviderModelsMock
}));

vi.mock("../../../../services/i18n", () => ({ t: (key: string) => key }));

// A lightweight checkbox that records its onChange so we can toggle it directly.
const checkboxHandlers = new Map<string, (checked: boolean) => void>();
vi.mock("../../../react/FormCheckbox", () => ({
    default: ({ name, currentValue, onChange }: { name?: string; currentValue: boolean; onChange: (c: boolean) => void }) => {
        checkboxHandlers.set(name ?? "", onChange);
        return <div className="checkbox-stub" data-name={name} data-checked={String(currentValue)} />;
    }
}));

import ModelSelection from "./ModelSelection";

const MODELS: LlmModelInfo[] = [
    { id: "gpt-4.1", name: "GPT-4.1", pricing: { input: 2, output: 8 }, isDefault: true, costMultiplier: 1 },
    { id: "gpt-4o", name: "GPT-4o", pricing: { input: 2.5, output: 10 }, isLegacy: true, costMultiplier: 1.2 },
    { id: "custom", name: "Custom" }
];

let container: HTMLDivElement | undefined;

async function renderSelection(props: Parameters<typeof ModelSelection>[0]) {
    container = document.createElement("div");
    document.body.appendChild(container);
    const target = container;
    await act(async () => { render(<ModelSelection {...props} />, target); });
    // Flush the fetch promise + the state updates it schedules.
    await act(async () => {});
}

describe("ModelSelection", () => {
    beforeEach(() => {
        fetchProviderModelsMock.mockResolvedValue(MODELS);
    });

    afterEach(() => {
        if (container) {
            render(null, container);
            container.remove();
            container = undefined;
        }
        checkboxHandlers.clear();
        fetchProviderModelsMock.mockReset();
    });

    it("fetches the provider's models and renders one checkbox per model", async () => {
        const query = { provider: "openai", apiKey: "sk-test", baseURL: "http://x/v1" };
        await renderSelection({ query, selected: MODELS, onChange: vi.fn() });

        expect(fetchProviderModelsMock).toHaveBeenCalledWith(query);
        const names = [...container!.querySelectorAll(".checkbox-stub")].map(el => el.getAttribute("data-name"));
        expect(names).toEqual(["model-gpt-4.1", "model-gpt-4o", "model-custom"]);
    });

    it("auto-selects only non-legacy models when nothing is selected yet", async () => {
        const onChange = vi.fn();
        await renderSelection({ query: { provider: "openai" }, selected: [], onChange, autoSelectDefaults: true });
        expect(onChange).toHaveBeenCalledWith([MODELS[0], MODELS[2]]); // gpt-4o (legacy) excluded
    });

    it("does not auto-select when a selection already exists", async () => {
        const onChange = vi.fn();
        await renderSelection({ query: { provider: "openai" }, selected: [MODELS[0]], onChange, autoSelectDefaults: true });
        expect(onChange).not.toHaveBeenCalled();
    });

    it("toggling a checkbox adds or removes that model", async () => {
        const onChange = vi.fn();
        await renderSelection({ query: { provider: "openai" }, selected: [MODELS[0]], onChange });

        act(() => checkboxHandlers.get("model-custom")?.(true));
        expect(onChange).toHaveBeenLastCalledWith([MODELS[0], MODELS[2]]);

        act(() => checkboxHandlers.get("model-gpt-4.1")?.(false));
        expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("select-all / select-none toggles the whole list", async () => {
        const onChange = vi.fn();
        await renderSelection({ query: { provider: "openai" }, selected: [], onChange });

        const button = container!.querySelector("button") as HTMLButtonElement;
        act(() => button.click());
        expect(onChange).toHaveBeenLastCalledWith(MODELS);
    });

    it("renders an error state when the fetch fails", async () => {
        fetchProviderModelsMock.mockRejectedValue(new Error("bad key"));
        await renderSelection({ query: { provider: "openai" }, selected: [], onChange: vi.fn() });
        expect(container!.textContent).toContain("llm.models_load_failed");
    });

    it("renders an empty state when the provider returns no models", async () => {
        fetchProviderModelsMock.mockResolvedValue([]);
        await renderSelection({ query: { provider: "openai" }, selected: [], onChange: vi.fn() });
        expect(container!.textContent).toContain("llm.models_none_available");
    });
});
