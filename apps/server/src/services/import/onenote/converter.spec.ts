import { SANITIZER_DEFAULT_ALLOWED_TAGS } from "@triliumnext/commons";
import { cls, options as optionService } from "@triliumnext/core";
import { parse } from "node-html-parser";
import { beforeAll, describe, expect, it } from "vitest";

import converter from "./converter.js";

beforeAll(() => {
    // The shared fixture DB predates `<u>` being allowlisted; align the sanitizer's allowed tags with
    // the current default so the test asserts the end result a fresh install would store.
    cls.init(() => optionService.setOption("allowedHtmlTags", JSON.stringify(SANITIZER_DEFAULT_ALLOWED_TAGS)));
});

// A representative OneNote page as returned by the Graph API: margin-0 paragraphs, a numbered and
// two bulleted lists, a trailing empty list item, and bare block-level <br> elements that OneNote
// uses for vertical spacing between blocks.
const SAMPLE = `<html lang="en-US">
    <head>
        <title>2020-09-02. Customer Daily</title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="created" content="2020-09-02T09:37:00.0000000" />
    </head>
    <body data-absolute-enabled="true" style="font-family:Calibri;font-size:11pt">
        <div style="position:absolute;left:48px;top:115px;width:576px">
            <p style="margin-top:0pt;margin-bottom:0pt"><span style="font-weight:bold">Participants:</span></p>
            <ol>
                <li>Participant 1</li>
                <li>Participant 2</li>
            </ol>
            <br />
            <p style="margin-top:0pt;margin-bottom:0pt"><span style="font-weight:bold">Agenda:</span></p>
            <ul>
                <li>ACME-1234</li>
                <li>ACME-1235</li>
                <li><br />
                </li>
            </ul>
            <br />
            <p style="margin-top:0pt;margin-bottom:0pt"><span style="font-weight:bold">Discussion:</span></p>
            <ul>
                <li>Subject 1</li>
                <li>Subject 2</li>
            </ul>
        </div>
    </body>
</html>`;

// Real OneNote source (debug-captured): bold/italic/underline are carried as inline styles on
// <span>, individually and combined on a single span.
const FORMATTING_SAMPLE = `<html lang="en-US">
    <body data-absolute-enabled="true" style="font-family:Calibri;font-size:11pt">
        <div style="position:absolute;left:54px;top:134px;width:624px">
            <p style="margin-top:0pt;margin-bottom:0pt">Normal text.</p>
            <p style="margin-top:0pt;margin-bottom:0pt"><span style="font-weight:bold">Bold text.</span></p>
            <p style="margin-top:0pt;margin-bottom:0pt"><span style="font-style:italic">Italic text.</span></p>
            <p style="margin-top:0pt;margin-bottom:0pt"><span style="text-decoration:underline">Under line text.</span></p>
            <p style="margin-top:0pt;margin-bottom:0pt"><span style="font-weight:bold;font-style:italic">Bold and italic text.</span></p>
            <p style="margin-top:0pt;margin-bottom:0pt"><span style="font-weight:bold;text-decoration:underline">Bold and underline text</span></p>
            <p style="margin-top:0pt;margin-bottom:0pt"><span style="font-weight:bold;font-style:italic;text-decoration:underline">Bold, italic and underline text</span></p>
        </div>
    </body>
</html>`;

// Tests assert the end result (the HTML actually stored on the note, i.e. after sanitization).
describe("convertPageHtml", () => {
    it("strips OneNote's block-level <br> spacing and empty list items, keeping real content", () => {
        const out = converter.convertPageHtml(SAMPLE);
        const root = parse(out);

        // The two bare <br> after </ol>/</ul> and the <br> in the empty <li> are all gone.
        expect(root.querySelectorAll("br")).toHaveLength(0);

        // The trailing empty Agenda item is removed; the three lists keep their real items.
        const ol = root.querySelectorAll("ol");
        const uls = root.querySelectorAll("ul");
        expect(ol).toHaveLength(1);
        expect(uls).toHaveLength(2);
        expect(ol[0].querySelectorAll("li")).toHaveLength(2); // Participants 1-2
        expect(uls[0].querySelectorAll("li")).toHaveLength(2); // Agenda: ACME-1234/1235 (empty dropped)
        expect(uls[1].querySelectorAll("li")).toHaveLength(2); // Discussion 1-2

        // Headings and list contents survive.
        expect(out).toContain("Participants:");
        expect(out).toContain("Participant 1");
        expect(out).toContain("ACME-1234");
        expect(out).toContain("Discussion:");
        expect(out).toContain("Subject 2");
    });

    it("keeps genuine soft line breaks inside a paragraph", () => {
        const out = converter.convertPageHtml(`<body><p>line one<br />line two</p></body>`);
        expect(parse(out).querySelectorAll("br")).toHaveLength(1);
    });

    it("converts OneNote to-do tags into task-list checkboxes", () => {
        const out = converter.convertPageHtml(`<body><p data-tag="to-do:completed">done</p><p data-tag="to-do">todo</p></body>`);
        expect(out).toContain("[x] done");
        expect(out).toContain("[ ] todo");
    });

    it("converts inline-style formatting (bold/italic/underline) to semantic tags", () => {
        const out = converter.convertPageHtml(FORMATTING_SAMPLE);
        expect(out).toContain("<strong>Bold text.</strong>");
        expect(out).toContain("<em>Italic text.</em>");
        expect(out).toContain("<u>Under line text.</u>");
        expect(out).toContain("<strong><em>Bold and italic text.</em></strong>");
        expect(out).toContain("<strong><u>Bold and underline text</u></strong>");
        expect(out).toContain("<strong><em><u>Bold, italic and underline text</u></em></strong>");
    });
});
