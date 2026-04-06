import { describe, it, expect, vi, beforeEach } from "vitest";
import becca from "../becca/becca.js";
import { buildNote } from "../test/becca_easy_mocking.js";
import customDictionary from "./custom_dictionary.js";

vi.mock("./log.js", () => ({
    default: {
        info: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock("./sql.js", () => ({
    default: {
        transactional: (cb: Function) => cb(),
        execute: () => {},
        replace: () => {},
        getMap: () => {},
        getValue: () => null,
        upsert: () => {}
    }
}));

function mockSession(localWords: string[] = []) {
    return {
        listWordsInSpellCheckerDictionary: vi.fn().mockResolvedValue(localWords),
        addWordToSpellCheckerDictionary: vi.fn()
    } as any;
}

describe("custom_dictionary", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        becca.reset();
        buildNote({
            id: "_customDictionary",
            title: "Custom Dictionary",
            type: "code",
            content: ""
        });
    });

    describe("loadForSession", () => {
        it("does nothing when note is empty and no local words", async () => {
            const session = mockSession();

            await customDictionary.loadForSession(session);

            expect(session.addWordToSpellCheckerDictionary).not.toHaveBeenCalled();
        });

        it("imports local words when note is empty (one-time import)", async () => {
            const session = mockSession(["hello", "world"]);

            await customDictionary.loadForSession(session);

            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(2);
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("hello");
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("world");
        });

        it("loads note words into session when no local words exist", async () => {
            becca.reset();
            buildNote({
                id: "_customDictionary",
                title: "Custom Dictionary",
                type: "code",
                content: "apple\nbanana"
            });
            const session = mockSession();

            await customDictionary.loadForSession(session);

            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(2);
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("apple");
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("banana");
        });

        it("merges note and local words when both have content", async () => {
            becca.reset();
            buildNote({
                id: "_customDictionary",
                title: "Custom Dictionary",
                type: "code",
                content: "apple\nbanana"
            });
            const session = mockSession(["banana", "cherry"]);

            await customDictionary.loadForSession(session);

            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(3);
        });

        it("does not save when local words are a subset of note words", async () => {
            becca.reset();
            buildNote({
                id: "_customDictionary",
                title: "Custom Dictionary",
                type: "code",
                content: "apple\nbanana\ncherry"
            });
            const session = mockSession(["apple", "banana"]);

            await customDictionary.loadForSession(session);

            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(3);
        });

        it("handles note with whitespace and blank lines", async () => {
            becca.reset();
            buildNote({
                id: "_customDictionary",
                title: "Custom Dictionary",
                type: "code",
                content: "  apple \n\n  banana  \n\n"
            });
            const session = mockSession();

            await customDictionary.loadForSession(session);

            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(2);
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("apple");
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("banana");
        });

        it("handles missing dictionary note gracefully", async () => {
            becca.reset(); // no note created
            const session = mockSession(["hello"]);

            await customDictionary.loadForSession(session);

            expect(session.addWordToSpellCheckerDictionary).not.toHaveBeenCalled();
        });
    });
});
