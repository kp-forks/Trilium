import { describe, expect, it } from "vitest";

import { convertEnexContent, rewriteEvernoteLinks } from "./enex_converter.js";

// Mirrors the canonical CKEditor todo-list serialization the converter emits (checked before disabled).
const todoItem = (desc: string, opts: { checked?: boolean; nested?: string } = {}) =>
    `<li><label class="todo-list__label"><input type="checkbox"${opts.checked ? ` checked="checked"` : ""} disabled="disabled"><span class="todo-list__label__description">${desc}</span></label>${opts.nested ?? ""}</li>`;
const todoList = (...items: string[]) => `<ul class="todo-list">${items.join("")}</ul>`;

describe("convertEnexContent — checkboxes (--en-todo lists)", () => {
    it("converts an unchecked checkbox item to a CKEditor todo-list", () => {
        const input = `<ul style="--en-todo:true;"><li style="--en-checked:false;"><div>Checkbox</div></li></ul>`;
        expect(convertEnexContent(input)).toBe(todoList(todoItem("Checkbox")));
    });

    it("marks a checked item with checked=\"checked\"", () => {
        const input = `<ul style="--en-todo:true;"><li style="--en-checked:true;"><div>Done</div></li></ul>`;
        expect(convertEnexContent(input)).toBe(todoList(todoItem("Done", { checked: true })));
    });

    it("treats a missing --en-checked as unchecked", () => {
        const input = `<ul style="--en-todo:true;"><li><div>No state</div></li></ul>`;
        expect(convertEnexContent(input)).toBe(todoList(todoItem("No state")));
    });

    it("preserves inline formatting inside the item text", () => {
        const input = `<ul style="--en-todo:true;"><li style="--en-checked:false;"><div>Buy <strong>milk</strong></div></li></ul>`;
        expect(convertEnexContent(input)).toBe(todoList(todoItem("Buy <strong>milk</strong>")));
    });

    it("nests a sub-list (a sibling --en-todo ul) into the preceding item, matching the reference note", () => {
        const input = `<ul style="--en-todo:true;"><li style="--en-checked:false;"><div>Checkbox</div></li><ul style="--en-todo:true;"><li style="--en-checked:false;"><div>Sub</div></li></ul><li style="--en-checked:true;"><div>Checked</div></li></ul>`;
        expect(convertEnexContent(input)).toBe(
            todoList(
                todoItem("Checkbox", { nested: todoList(todoItem("Sub")) }),
                todoItem("Checked", { checked: true })
            )
        );
    });

    it("leaves a plain (non --en-todo) bullet list untouched", () => {
        const input = `<ul><li><div>Bullet</div></li></ul>`;
        expect(convertEnexContent(input)).toBe(input);
    });
});

describe("convertEnexContent — code blocks (--en-codeblock)", () => {
    it("converts a code block, mapping the syntax language to a CKEditor mime class and joining lines", () => {
        const input = `<div style="--en-codeblock:true; --en-syntaxLanguage:c; --en-lineWrapping:false;box-sizing: border-box;"><div>void main() {</div><div>    printf("Hello world.\\n");</div><div>}</div></div>`;
        expect(convertEnexContent(input)).toBe(
            `<pre><code class="language-text-x-csrc">void main() {\n    printf("Hello world.\\n");\n}</code></pre>`
        );
    });

    it("preserves literal quotes inside code (does not leave &quot;)", () => {
        const input = `<div style="--en-codeblock:true; --en-syntaxLanguage:javascript;"><div>console.log("hi");</div></div>`;
        expect(convertEnexContent(input)).toBe(`<pre><code class="language-text-javascript">console.log("hi");</code></pre>`);
    });

    it("escapes HTML-significant characters in code", () => {
        const input = `<div style="--en-codeblock:true; --en-syntaxLanguage:html;"><div>&lt;a href="x"&gt;link&lt;/a&gt;</div></div>`;
        expect(convertEnexContent(input)).toContain(`&lt;a href="x"&gt;link&lt;/a&gt;`);
    });

    it("falls back to auto-detect when the language is unknown or absent", () => {
        const unknown = `<div style="--en-codeblock:true; --en-syntaxLanguage:zzz;"><div>x</div></div>`;
        expect(convertEnexContent(unknown)).toBe(`<pre><code class="language-text-x-trilium-auto">x</code></pre>`);
        const absent = `<div style="--en-codeblock:true;"><div>x</div></div>`;
        expect(convertEnexContent(absent)).toBe(`<pre><code class="language-text-x-trilium-auto">x</code></pre>`);
    });

    it("renders an empty code line (a <br>-only div) as a blank line", () => {
        const input = `<div style="--en-codeblock:true; --en-syntaxLanguage:c;"><div>a</div><div><br/></div><div>b</div></div>`;
        expect(convertEnexContent(input)).toBe(`<pre><code class="language-text-x-csrc">a\n\nb</code></pre>`);
    });
});

describe("convertEnexContent — math (--en-formulablock)", () => {
    it("converts a formula block to a CKEditor display-math span", () => {
        const input = `<div style="--en-formulablock:true; --en-isEditMode:true;box-sizing: border-box;"><div>e=mc^2</div></div>`;
        expect(convertEnexContent(input)).toBe(`<span class="math-tex">\\[e=mc^2\\]</span>`);
    });

    it("drops an empty formula block", () => {
        const input = `<div style="--en-formulablock:true;"><div><br/></div></div>`;
        expect(convertEnexContent(input)).toBe("");
    });
});

describe("convertEnexContent — mermaid (--en-mermaidblock)", () => {
    it("converts a mermaid block to a language-mermaid code block", () => {
        const input = `<div style="--en-mermaidblock:true; --en-displayMode:split;box-sizing: border-box;"><div>graph TD</div><div>  Mermaid --> Diagram</div></div>`;
        expect(convertEnexContent(input)).toBe(
            `<pre><code class="language-mermaid">graph TD\n  Mermaid --&gt; Diagram</code></pre>`
        );
    });
});

describe("convertEnexContent — tasks (--en-task-group + <task> elements)", () => {
    it("replaces the task-group placeholder with a todo-list of its tasks (matched by group id), trimming titles", () => {
        const input = `<div style="--en-task-group:true; --en-id:GROUP1;--en-content-hash:abc;color:#868686"><div>Content not supported</div><div>This block is a placeholder for Tasks…</div></div>`;
        const tasks = [
            { title: "Task", status: "open", groupId: "GROUP1" },
            { title: " Another task", status: "completed", groupId: "GROUP1" }
        ];
        expect(convertEnexContent(input, tasks)).toBe(
            todoList(todoItem("Task"), todoItem("Another task", { checked: true }))
        );
    });

    it("only includes tasks whose group id matches the placeholder", () => {
        const input = `<div style="--en-task-group:true; --en-id:GROUP1;"><div>placeholder</div></div>`;
        const tasks = [
            { title: "Mine", status: "open", groupId: "GROUP1" },
            { title: "Other", status: "open", groupId: "GROUP2" }
        ];
        expect(convertEnexContent(input, tasks)).toBe(todoList(todoItem("Mine")));
    });

    it("escapes HTML in task titles", () => {
        const input = `<div style="--en-task-group:true; --en-id:G;"><div>placeholder</div></div>`;
        const tasks = [{ title: "a < b & c", status: "open", groupId: "G" }];
        expect(convertEnexContent(input, tasks)).toBe(todoList(todoItem("a &lt; b &amp; c")));
    });

    it("removes the placeholder even when there are no matching tasks", () => {
        const input = `<div style="--en-task-group:true; --en-id:G;"><div>placeholder</div></div>`;
        expect(convertEnexContent(input, [])).toBe("");
    });
});

describe("convertEnexContent — admonitions (--en-callout)", () => {
    it("maps the default light-bulb callout to a tip admonition (emoji dropped)", () => {
        const input = `<div style="--en-callout:true; --en-emoji:💡;--en-requiredFeatures:&quot;[\\&quot;callout\\&quot;]&quot;;"><div>Callout with default icon.</div></div>`;
        expect(convertEnexContent(input)).toBe(`<aside class="admonition tip"><div>Callout with default icon.</div></aside>`);
    });

    it("maps a custom-emoji callout to a note admonition with the emoji injected into the content", () => {
        const input = `<div style="--en-callout:true; --en-emoji:🤖;"><div>Callout with custom emoji.</div></div>`;
        expect(convertEnexContent(input)).toBe(`<aside class="admonition note"><div>🤖 Callout with custom emoji.</div></aside>`);
    });
});

describe("convertEnexContent — toggles (--en-toggle)", () => {
    it("converts a collapsed toggle into a Trilium collapsible <details> (no open attribute)", () => {
        const input = `<div style="--en-toggle:true; --en-isCollapsed:true;"><div style="--en-toggleSummary:true;">Toggle goes here</div><div style="--en-toggleContent:true;"><div style="padding-left:40px;">Content goes here.</div><div style="padding-left:40px;"><br/></div></div></div>`;
        expect(convertEnexContent(input)).toBe(
            `<details class="trilium-collapsible"><summary>Toggle goes here</summary><div style="padding-left:40px;">Content goes here.</div></details>`
        );
    });

    it("preserves an expanded toggle's open state", () => {
        const input = `<div style="--en-toggle:true; --en-isCollapsed:false;"><div style="--en-toggleSummary:true;">S</div><div style="--en-toggleContent:true;"><div>Body</div></div></div>`;
        expect(convertEnexContent(input)).toBe(
            `<details class="trilium-collapsible" open><summary>S</summary><div>Body</div></details>`
        );
    });
});

describe("convertEnexContent — composition and inertness", () => {
    it("leaves ordinary HTML untouched", () => {
        expect(convertEnexContent(`<p>Hello</p>`)).toBe(`<p>Hello</p>`);
    });

    it("does not let a self-closing <en-media> swallow an adjacent convertible block", () => {
        const input = `<en-media hash="x" type="image/png"/><div style="--en-codeblock:true; --en-syntaxLanguage:c;"><div>x</div></div>`;
        expect(convertEnexContent(input)).toBe(
            `<en-media hash="x" type="image/png"></en-media><pre><code class="language-text-x-csrc">x</code></pre>`
        );
    });

    it("converts a code block nested inside a callout", () => {
        const input = `<div style="--en-callout:true; --en-emoji:💡;"><div style="--en-codeblock:true; --en-syntaxLanguage:c;"><div>x</div></div></div>`;
        expect(convertEnexContent(input)).toBe(
            `<aside class="admonition tip"><pre><code class="language-text-x-csrc">x</code></pre></aside>`
        );
    });

    it("converts checkboxes nested inside a toggle's content", () => {
        const input = `<div style="--en-toggle:true; --en-isCollapsed:true;"><div style="--en-toggleSummary:true;">T</div><div style="--en-toggleContent:true;"><ul style="--en-todo:true;"><li style="--en-checked:true;"><div>Inner</div></li></ul></div></div>`;
        expect(convertEnexContent(input)).toBe(
            `<details class="trilium-collapsible"><summary>T</summary>${todoList(todoItem("Inner", { checked: true }))}</details>`
        );
    });
});

describe("rewriteEvernoteLinks — internal note references", () => {
    // Evernote renders an inline-richlink with the target note's title as its text, so the target is
    // resolved by that text. The map mirrors a title -> imported noteId lookup built during import.
    const resolve = (text: string) => (({ "Orar legislație": "noteA", "Acte necesare înscriere": "noteB" }) as Record<string, string>)[text] ?? null;

    it("rewrites an evernote://view-note link into a Trilium reference link when the text matches a note title", () => {
        const input = `<div><a href="evernote://view-note/73bdd2cd-f542-4dc6-8e23-55e3566dd01d">Orar legislație</a></div>`;
        expect(rewriteEvernoteLinks(input, resolve)).toBe(`<div><a href="#root/noteA" class="reference-link">Orar legislație</a></div>`);
    });

    it("handles the classic evernote:///view/... link format", () => {
        const input = `<a href="evernote:///view/83639451/s1/4f73f255-780d-44aa-a2eb-20da435ea52d/4f73f255/">Acte necesare înscriere</a>`;
        expect(rewriteEvernoteLinks(input, resolve)).toBe(`<a href="#root/noteB" class="reference-link">Acte necesare înscriere</a>`);
    });

    it("leaves external links untouched", () => {
        const input = `<a href="http://triliumnotes.org">Text</a>`;
        expect(rewriteEvernoteLinks(input, resolve)).toBe(input);
    });

    it("leaves an unresolvable internal link as-is", () => {
        const input = `<a href="evernote://view-note/unknown">Some other note</a>`;
        expect(rewriteEvernoteLinks(input, resolve)).toBe(input);
    });

    it("rewrites only the internal links, preserving surrounding content and external links", () => {
        const input = `<p>See <a href="evernote://view-note/x">Orar legislație</a> and <a href="http://x.com">x</a>.</p>`;
        expect(rewriteEvernoteLinks(input, resolve)).toBe(
            `<p>See <a href="#root/noteA" class="reference-link">Orar legislație</a> and <a href="http://x.com">x</a>.</p>`
        );
    });
});
