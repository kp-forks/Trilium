import { NoteType } from "@triliumnext/commons";
import { describe, expect,it } from "vitest";

import preprocessContent from "./note_content_fulltext_preprocessor";

describe("Mind map preprocessing", () => {
    const type: NoteType = "mindMap";
    const mime = "application/json";

    it("supports empty JSON", () => {
        expect(preprocessContent("{}", type, mime)).toEqual("");
    });

    it("supports blank text / invalid JSON", () => {
        expect(preprocessContent("", type, mime)).toEqual("");
        expect(preprocessContent(`{ "node": " }`, type, mime)).toEqual("");
    });
});