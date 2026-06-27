import { describe, expect, it } from "vitest";

import { toObsidianLabels } from "./importer.js";

describe("toObsidianLabels", () => {
    it("maps each tag to its own label, the sanitized tag as the name", () => {
        expect(toObsidianLabels([
            { name: "tags", value: "Book" },
            { name: "tags", value: "Reading List" }
        ])).toEqual([
            { name: "book", value: "" },
            { name: "readingList", value: "" }
        ]);
    });

    it("maps each alias to an #alias label, preserving the alternate name", () => {
        expect(toObsidianLabels([
            { name: "aliases", value: "Alias one" },
            { name: "aliases", value: "Alias two" }
        ])).toEqual([
            { name: "alias", value: "Alias one" },
            { name: "alias", value: "Alias two" }
        ]);
    });

    it("drops cssclasses, publish and permalink", () => {
        expect(toObsidianLabels([
            { name: "cssclasses", value: "class1" },
            { name: "publish", value: "true" },
            { name: "permalink", value: "/x" }
        ])).toEqual([]);
    });

    it("leaves other properties untouched", () => {
        expect(toObsidianLabels([{ name: "first", value: "First value" }])).toEqual([{ name: "first", value: "First value" }]);
    });

    it("skips empty tag and alias values", () => {
        expect(toObsidianLabels([
            { name: "tags", value: "" },
            { name: "aliases", value: "  " }
        ])).toEqual([]);
    });
});
