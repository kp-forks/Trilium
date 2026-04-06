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
        addWordToSpellCheckerDictionary: vi.fn(),
        removeWordFromSpellCheckerDictionary: vi.fn()
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
            expect(session.removeWordFromSpellCheckerDictionary).not.toHaveBeenCalled();
        });

        it("imports local words when note is empty (one-time import)", async () => {
            const session = mockSession(["hello", "world"]);

            await customDictionary.loadForSession(session);

            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(2);
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("hello");
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("world");
        });

        it("clears local dictionary after one-time import", async () => {
            const session = mockSession(["hello", "world"]);

            await customDictionary.loadForSession(session);

            expect(session.removeWordFromSpellCheckerDictionary).toHaveBeenCalledTimes(2);
            expect(session.removeWordFromSpellCheckerDictionary).toHaveBeenCalledWith("hello");
            expect(session.removeWordFromSpellCheckerDictionary).toHaveBeenCalledWith("world");
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

        it("only loads note words when both note and local have content", async () => {
            becca.reset();
            buildNote({
                id: "_customDictionary",
                title: "Custom Dictionary",
                type: "code",
                content: "apple\nbanana"
            });
            const session = mockSession(["banana", "cherry"]);

            await customDictionary.loadForSession(session);

            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(2);
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("apple");
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("banana");
        });

        it("clears local dictionary when note has content", async () => {
            becca.reset();
            buildNote({
                id: "_customDictionary",
                title: "Custom Dictionary",
                type: "code",
                content: "apple\nbanana"
            });
            const session = mockSession(["banana", "cherry"]);

            await customDictionary.loadForSession(session);

            expect(session.removeWordFromSpellCheckerDictionary).toHaveBeenCalledTimes(2);
            expect(session.removeWordFromSpellCheckerDictionary).toHaveBeenCalledWith("banana");
            expect(session.removeWordFromSpellCheckerDictionary).toHaveBeenCalledWith("cherry");
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

        it("does not re-add words removed from the note but present locally", async () => {
            becca.reset();
            buildNote({
                id: "_customDictionary",
                title: "Custom Dictionary",
                type: "code",
                content: "apple\nbanana"
            });
            // "cherry" was previously in the note but user removed it;
            // it still lingers in Electron's local dictionary.
            const session = mockSession(["apple", "banana", "cherry"]);

            await customDictionary.loadForSession(session);

            // Only note words should be loaded, not "cherry".
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("apple");
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("banana");
            expect(session.addWordToSpellCheckerDictionary).not.toHaveBeenCalledWith("cherry");
        });

        it("handles missing dictionary note gracefully", async () => {
            becca.reset(); // no note created
            const session = mockSession(["hello"]);

            await customDictionary.loadForSession(session);

            expect(session.addWordToSpellCheckerDictionary).not.toHaveBeenCalled();
        });
    });
});
