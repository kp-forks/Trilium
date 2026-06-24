import { describe, expect, it } from "vitest";

import { toAttributeName } from "./collection.js";

describe("toAttributeName", () => {
    it("camelCases a multi-word name, lower-casing the first word", () => {
        expect(toAttributeName("Text column")).toBe("textColumn");
        expect(toAttributeName("Created by")).toBe("createdBy");
        expect(toAttributeName("Last edited by")).toBe("lastEditedBy");
    });

    it("treats hyphens, underscores, parentheses and other punctuation as word boundaries", () => {
        expect(toAttributeName("Multi-select")).toBe("multiSelect");
        expect(toAttributeName("snake_case")).toBe("snakeCase");
        expect(toAttributeName("Sub-title (v2)")).toBe("subTitleV2");
        expect(toAttributeName("Weight, kg")).toBe("weightKg");
    });

    it("lower-cases an all-caps acronym or single letter", () => {
        expect(toAttributeName("URL")).toBe("url");
        expect(toAttributeName("ID")).toBe("id");
        expect(toAttributeName("A")).toBe("a");
    });

    it("normalizes a single word to lower-case and leaves a plain name unchanged", () => {
        expect(toAttributeName("Status")).toBe("status");
        expect(toAttributeName("title")).toBe("title");
    });

    it("keeps digits attached to their word", () => {
        expect(toAttributeName("Q1 revenue")).toBe("q1Revenue");
        expect(toAttributeName("123")).toBe("123");
    });

    it("supports unicode letters", () => {
        expect(toAttributeName("Café date")).toBe("caféDate");
    });

    it("falls back to 'unnamed' when there is no alphanumeric content", () => {
        expect(toAttributeName("")).toBe("unnamed");
        expect(toAttributeName("()")).toBe("unnamed");
        expect(toAttributeName("   ")).toBe("unnamed");
    });
});
