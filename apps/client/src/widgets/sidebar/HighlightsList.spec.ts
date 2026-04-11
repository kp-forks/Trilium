import { describe, expect, it } from "vitest";
import { extractHighlightsFromStaticHtml } from "./HighlightsList.js";

describe("extractHighlightsFromStaticHtml", () => {
    it("extracts highlighted text with math equations", () => {
        const container = document.createElement("div");
        container.innerHTML = `<p>
            <span style="background-color:hsl(30,75%,60%);">
                Highlighted&nbsp;
                <span class="math-tex">
                    \\(e=mc^2\\)
                </span>
                &nbsp;math
            </span>
        </p>`;
        document.body.appendChild(container);

        const highlights = extractHighlightsFromStaticHtml(container);

        // Should extract 3 highlights: "Highlighted ", the math element, and " math"
        expect(highlights.length).toBe(3);

        // The math highlight should preserve the .math-tex wrapper
        const mathHighlight = highlights.find(h => h.text.includes("math-tex"));
        expect(mathHighlight).toBeDefined();
        expect(mathHighlight?.text).toContain('class="math-tex"');
        expect(mathHighlight?.text).toContain("e=mc^2");
        expect(mathHighlight?.attrs.background).toBeTruthy();

        document.body.removeChild(container);
    });
});
