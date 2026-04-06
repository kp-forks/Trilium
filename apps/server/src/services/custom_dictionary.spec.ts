import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./log.js", () => ({
    default: {
        info: vi.fn(),
        error: vi.fn()
    }
}));

const mockNote = {
    getContent: vi.fn(),
    setContent: vi.fn()
};

vi.mock("../becca/becca.js", () => ({
    default: {
        getNote: vi.fn()
    }
}));

import becca from "../becca/becca.js";
import customDictionary from "./custom_dictionary.js";

function mockSession(localWords: string[] = []) {
    return {
        listWordsInSpellCheckerDictionary: vi.fn().mockResolvedValue(localWords),
        addWordToSpellCheckerDictionary: vi.fn()
    } as any;
}

describe("custom_dictionary", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(becca.getNote).mockReturnValue(mockNote as any);
    });

    describe("loadForSession", () => {
        it("does nothing when note is empty and no local words", async () => {
            mockNote.getContent.mockReturnValue("");
            const session = mockSession();

            await customDictionary.loadForSession(session);

            expect(session.addWordToSpellCheckerDictionary).not.toHaveBeenCalled();
            expect(mockNote.setContent).not.toHaveBeenCalled();
        });

        it("imports local words when note is empty (one-time import)", async () => {
            mockNote.getContent.mockReturnValue("");
            const session = mockSession(["hello", "world"]);

            await customDictionary.loadForSession(session);

            expect(mockNote.setContent).toHaveBeenCalledWith("hello\nworld");
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(2);
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("hello");
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("world");
        });

        it("loads note words into session when no local words exist", async () => {
            mockNote.getContent.mockReturnValue("apple\nbanana");
            const session = mockSession();

            await customDictionary.loadForSession(session);

            expect(mockNote.setContent).not.toHaveBeenCalled();
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(2);
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("apple");
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("banana");
        });

        it("merges note and local words when both have content", async () => {
            mockNote.getContent.mockReturnValue("apple\nbanana");
            const session = mockSession(["banana", "cherry"]);

            await customDictionary.loadForSession(session);

            // Should save the merged set (apple + banana + cherry), sorted
            expect(mockNote.setContent).toHaveBeenCalledWith("apple\nbanana\ncherry");
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(3);
        });

        it("does not save when local words are a subset of note words", async () => {
            mockNote.getContent.mockReturnValue("apple\nbanana\ncherry");
            const session = mockSession(["apple", "banana"]);

            await customDictionary.loadForSession(session);

            expect(mockNote.setContent).not.toHaveBeenCalled();
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(3);
        });

        it("handles note with whitespace and blank lines", async () => {
            mockNote.getContent.mockReturnValue("  apple \n\n  banana  \n\n");
            const session = mockSession();

            await customDictionary.loadForSession(session);

            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(2);
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("apple");
            expect(session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("banana");
        });

        it("handles missing dictionary note gracefully", async () => {
            vi.mocked(becca.getNote).mockReturnValue(null as any);
            const session = mockSession(["hello"]);

            await customDictionary.loadForSession(session);

            // Can't save, but shouldn't crash
            expect(session.addWordToSpellCheckerDictionary).not.toHaveBeenCalled();
        });
    });
});
