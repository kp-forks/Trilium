import $ from "jquery";
import { describe, expect, it, vi } from "vitest";

import { setupAnswerEventHandlers } from "./RelationMap.js";

vi.mock("../../../services/utils.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../services/utils.js")>();
    return {
        ...actual,
        default: {
            ...actual.default,
            filterAttributeName: vi.fn((val: string) => val)
        }
    };
});

describe("RelationMap - $answer event synchronization", () => {

    it("dispatches input event with bubbles:true when Enter is pressed", () => {
        const $answer = $("<input type='text' />");
        const dispatchSpy = vi.spyOn($answer[0], "dispatchEvent");

        setupAnswerEventHandlers($answer);
        $answer.trigger($.Event("keydown", { key: "Enter" }));

        expect(dispatchSpy).toHaveBeenCalledWith(
            expect.objectContaining({ type: "input", bubbles: true })
        );
    });

    it("dispatches input event with bubbles:true when input loses focus (blur)", () => {
        const $answer = $("<input type='text' />");
        const dispatchSpy = vi.spyOn($answer[0], "dispatchEvent");

        setupAnswerEventHandlers($answer);
        $answer.trigger("blur");

        expect(dispatchSpy).toHaveBeenCalledWith(
            expect.objectContaining({ type: "input", bubbles: true })
        );
    });

    it("does not dispatch input event for non-Enter keys", () => {
        const $answer = $("<input type='text' />");
        const dispatchSpy = vi.spyOn($answer[0], "dispatchEvent");

        setupAnswerEventHandlers($answer);
        $answer.trigger($.Event("keydown", { key: "a" }));
        $answer.trigger($.Event("keydown", { key: "Tab" }));
        $answer.trigger($.Event("keydown", { key: "Escape" }));

        const inputEvents = dispatchSpy.mock.calls
            .map(([e]) => e as Event)
            .filter((e) => e.type === "input" && e.bubbles === true);
        expect(inputEvents).toHaveLength(0);
    });

    it("input event bubbles up to parent element", () => {
        const $answer = $("<input type='text' />");
        const parent = document.createElement("div");
        parent.appendChild($answer[0]);

        const parentListener = vi.fn();
        parent.addEventListener("input", parentListener);

        setupAnswerEventHandlers($answer);
        $answer.trigger($.Event("keydown", { key: "Enter" }));

        expect(parentListener).toHaveBeenCalledOnce();
        expect(parentListener.mock.calls[0][0]).toMatchObject({ type: "input", bubbles: true });
    });

});
