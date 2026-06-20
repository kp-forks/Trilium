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

// Real OneNote source (debug-captured): subscript/superscript are real <sub>/<sup> tags, while
// strikethrough is carried as a text-decoration inline style.
const SUPERSCRIPT_SAMPLE = `<html lang="en-US">
    <body data-absolute-enabled="true" style="font-family:Calibri;font-size:11pt">
        <div style="position:absolute;left:48px;top:115px;width:624px">
            <p style="margin-top:0pt;margin-bottom:0pt">Normal <sub>sub</sub> <sup>sup</sup> <span style="text-decoration:line-through">strikethrough</span></p>
        </div>
    </body>
</html>`;

// Real OneNote source (debug-captured): highlight and font color use CSS *named* colors, which the
// sanitizer's colorRegex (hex/rgb/hsl only) would otherwise strip.
const HIGHLIGHT_SAMPLE = `<html lang="en-US">
    <body data-absolute-enabled="true" style="font-family:Calibri;font-size:11pt">
        <div style="position:absolute;left:48px;top:115px;width:624px">
            <p style="margin-top:0pt;margin-bottom:0pt"><span style="background-color:yellow">Yellow</span></p>
            <p style="margin-top:0pt;margin-bottom:0pt"><span style="color:white;background-color:fuchsia">Magenta</span></p>
            <p style="margin-top:0pt;margin-bottom:0pt"><span style="color:black;background-color:silver">Light Gray</span></p>
        </div>
    </body>
</html>`;

// Real OneNote source (debug-captured): named styles are mostly real tags (h1-h6, cite) plus inline
// styling. The sanitizer demotes a contiguous heading run by one level (h1 is reserved for the note
// title), and font-style:italic is handled by convertInlineFormatting.
const STYLES_SAMPLE = `<html lang="en-US">
    <body data-absolute-enabled="true" style="font-family:Calibri;font-size:11pt">
        <div style="position:absolute;left:48px;top:115px;width:624px">
            <h1 style="font-size:16pt;color:#1e4e79;margin-top:0pt;margin-bottom:0pt">Heading 1</h1>
            <h2 style="font-size:14pt;color:#2e75b5;margin-top:0pt;margin-bottom:0pt">Heading 2</h2>
            <h3 style="font-size:12pt;color:#1f3763;margin-top:0pt;margin-bottom:0pt">Heading 3</h3>
            <h4 style="font-size:12pt;color:#2f5496;font-style:italic;margin-top:0pt;margin-bottom:0pt">Heading 4</h4>
            <h5 style="color:#2e75b5;margin-top:0pt;margin-bottom:0pt">Heading 5</h5>
            <h6 style="color:#2e75b5;font-style:italic;margin-top:0pt;margin-bottom:0pt">Heading 6</h6>
            <cite style="font-size:9pt;color:#595959;margin-top:0pt;margin-bottom:0pt">Citation</cite>
            <p style="color:#595959;font-style:italic;margin-top:0pt;margin-bottom:0pt">Quote</p>
            <p style="font-family:Calibri Light;font-size:20pt;margin-top:0pt;margin-bottom:0pt">Title</p>
            <p style="font-family:Consolas;margin-top:0pt;margin-bottom:0pt">Code</p>
        </div>
    </body>
</html>`;

// Real OneNote source (debug-captured): to-do items are paragraphs tagged with data-tag="to-do" /
// "to-do:completed", not list markup.
const TAGS_SAMPLE = `<html lang="en-US">
    <body data-absolute-enabled="true" style="font-family:Calibri;font-size:11pt">
        <div style="position:absolute;left:48px;top:115px;width:624px">
            <p data-tag="to-do" style="margin-top:0pt;margin-bottom:0pt">To do</p>
            <p data-tag="to-do" style="margin-top:0pt;margin-bottom:0pt">Another todo</p>
            <p data-tag="to-do:completed" style="margin-top:0pt;margin-bottom:0pt">Completed todo</p>
            <p data-tag="to-do" style="margin-top:0pt;margin-bottom:0pt">Another non-completed TODO</p>
        </div>
    </body>
</html>`;

// Real OneNote source (debug-captured): a free-form page with four absolutely-positioned text boxes
// whose document order differs from their visual (top-to-bottom) reading order.
const ALIGNMENT_SAMPLE = `<html lang="en-US">
    <body data-absolute-enabled="true" style="font-family:Calibri;font-size:11pt">
        <div style="position:absolute;left:512px;top:210px;width:624px">
            <p style="margin-top:0pt;margin-bottom:0pt">The quick</p>
        </div>
        <div style="position:absolute;left:318px;top:333px;width:624px">
            <p style="margin-top:0pt;margin-bottom:0pt">Brown fox</p>
        </div>
        <div style="position:absolute;left:579px;top:441px;width:624px">
            <p style="margin-top:0pt;margin-bottom:0pt">Jumps over the lazy dog</p>
        </div>
        <div style="position:absolute;left:222px;top:277px;width:624px">
            <p style="margin-top:0pt;margin-bottom:0pt">And then it jumps again.</p>
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

    it("orders absolutely-positioned text boxes by position (top, then left)", () => {
        const out = converter.convertPageHtml(ALIGNMENT_SAMPLE);
        const paragraphs = parse(out).querySelectorAll("p").map((p) => p.textContent.trim());
        expect(paragraphs).toEqual([
            "The quick",
            "And then it jumps again.",
            "Brown fox",
            "Jumps over the lazy dog"
        ]);
    });

    it("converts OneNote to-do tags into a Trilium task list", () => {
        const out = converter.convertPageHtml(TAGS_SAMPLE);
        const root = parse(out);

        // Consecutive to-do paragraphs become one CKEditor todo-list, not literal "[ ]" text.
        expect(root.querySelectorAll("ul.todo-list")).toHaveLength(1);
        expect(root.querySelectorAll("li")).toHaveLength(4);
        expect(root.querySelectorAll(`input[type="checkbox"]`)).toHaveLength(4);
        expect(root.querySelectorAll("span.todo-list__label__description")).toHaveLength(4);

        // Exactly the one completed item is checked.
        expect(root.querySelectorAll("input[checked]")).toHaveLength(1);

        expect(out).toContain("Completed todo");
        expect(out).not.toContain("[ ]");
        expect(out).not.toContain("[x]");
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

    it("preserves superscript/subscript and converts strikethrough", () => {
        const out = converter.convertPageHtml(SUPERSCRIPT_SAMPLE);
        expect(out).toContain("<sub>sub</sub>");
        expect(out).toContain("<sup>sup</sup>");
        expect(out).toContain("<del>strikethrough</del>");
    });

    it("maps OneNote named highlight/font colors to hex so they survive sanitization", () => {
        const out = converter.convertPageHtml(HIGHLIGHT_SAMPLE);
        expect(out).toContain("background-color:#ffff00"); // yellow
        expect(out).toContain("color:#ffffff"); // white
        expect(out).toContain("background-color:#ff00ff"); // fuchsia
        expect(out).toContain("color:#000000"); // black
        expect(out).toContain("background-color:#c0c0c0"); // silver
        expect(out).toContain("Yellow");
        expect(out).toContain("Magenta");
    });

    it("keeps OneNote heading styles (level-shifted), cite, italic and font colors", () => {
        const out = converter.convertPageHtml(STYLES_SAMPLE);
        const root = parse(out);

        // Headings survive but shift down one level (h1 reserved for the note title).
        expect(root.querySelectorAll("h2")[0]?.textContent).toContain("Heading 1");
        expect(root.querySelectorAll("h3")[0]?.textContent).toContain("Heading 2");
        // Italic headings/quote get an <em> wrap; heading colors (hex) survive.
        expect(out).toContain("<em>Heading 4</em>");
        expect(out).toContain("<em>Quote</em>");
        expect(out).toContain("#1e4e79");
        // <cite> is allowlisted and kept.
        expect(root.querySelector("cite")?.textContent).toContain("Citation");
    });

    it("maps the Title style to text-huge and the Code style to <code>", () => {
        const out = converter.convertPageHtml(STYLES_SAMPLE);
        expect(out).toContain(`<span class="text-huge">Title</span>`);
        expect(out).toContain("<code>Code</code>");
    });
});
