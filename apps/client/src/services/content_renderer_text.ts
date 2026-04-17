import FAttachment from "../entities/fattachment.js";
import FNote from "../entities/fnote.js";
import { default as content_renderer, type RenderOptions } from "./content_renderer.js";
import froca from "./froca.js";
import link from "./link.js";
import { renderMathInElement } from "./math.js";
import { getMermaidConfig } from "./mermaid.js";
import { formatCodeBlocks } from "./syntax_highlight.js";
import tree from "./tree.js";
import { isHtmlEmpty } from "./utils.js";

export default async function renderText(note: FNote | FAttachment, $renderedContent: JQuery<HTMLElement>, options: RenderOptions = {}) {
    // entity must be FNote
    const blob = await note.getBlob();

    if (blob && !isHtmlEmpty(blob.content)) {
        $renderedContent.append($('<div class="ck-content">').html(blob.content));

        const seenNoteIds = options.seenNoteIds ?? new Set<string>();
        seenNoteIds.add("noteId" in note ? note.noteId : note.attachmentId);
        if (!options.noIncludedNotes) {
            await renderIncludedNotes($renderedContent[0], seenNoteIds);
        } else {
            $renderedContent.find("section.include-note").remove();
        }

        if ($renderedContent.find("span.math-tex").length > 0) {
            renderMathInElement($renderedContent[0], { trust: true });
        }

        const getNoteIdFromLink = (el: HTMLElement) => tree.getNoteIdFromUrl($(el).attr("href") || "");
        const referenceLinks = $renderedContent.find<HTMLAnchorElement>("a.reference-link");
        const noteIdsToPrefetch = referenceLinks.map((i, el) => getNoteIdFromLink(el));
        await froca.getNotes(noteIdsToPrefetch);

        for (const el of referenceLinks) {
            const innerSpan = document.createElement("span");
            await link.loadReferenceLinkTitle($(innerSpan), el.href);
            el.replaceChildren(innerSpan);
        }

        await rewriteMermaidDiagramsInContainer($renderedContent[0] as HTMLDivElement);
        await formatCodeBlocks($renderedContent);
    } else if (note instanceof FNote && !options.noChildrenList) {
        await renderChildrenList($renderedContent, note, options.includeArchivedNotes ?? false);
    }
}

async function renderIncludedNotes(contentEl: HTMLElement, seenNoteIds: Set<string>) {
    // TODO: Consider duplicating with server's share/content_renderer.ts.
    const includeNoteEls = contentEl.querySelectorAll("section.include-note");

    // Gather the list of items to load.
    const noteIds: string[] = [];
    for (const includeNoteEl of includeNoteEls) {
        const noteId = includeNoteEl.getAttribute("data-note-id");
        if (noteId) {
            noteIds.push(noteId);
        }
    }

    // Load the required notes.
    await froca.getNotes(noteIds);

    // Render and integrate the notes.
    for (const includeNoteEl of includeNoteEls) {
        const noteId = includeNoteEl.getAttribute("data-note-id");
        if (!noteId) continue;

        const note = froca.getNoteFromCache(noteId);
        if (!note) {
            console.warn(`Unable to include ${noteId} because it could not be found.`);
            continue;
        }

        if (seenNoteIds.has(noteId)) {
            console.warn(`Skipping inclusion of ${noteId} to avoid circular reference.`);
            includeNoteEl.remove();
            continue;
        }

        const renderedContent = (await content_renderer.getRenderedContent(note, {
            seenNoteIds
        })).$renderedContent;
        includeNoteEl.replaceChildren(...renderedContent);
    }
}

/** Rewrite the code block from <pre><code> to <div> in order not to apply a codeblock style to it. */
export async function rewriteMermaidDiagramsInContainer(container: HTMLDivElement) {
    const mermaidBlocks = container.querySelectorAll('pre:has(code[class="language-mermaid"])');
    if (!mermaidBlocks.length) return;
    const nodes: HTMLElement[] = [];

    for (const mermaidBlock of mermaidBlocks) {
        const div = document.createElement("div");
        div.classList.add("mermaid-diagram");
        div.innerHTML = mermaidBlock.querySelector("code")?.innerHTML ?? "";
        mermaidBlock.replaceWith(div);
        nodes.push(div);
    }
}

/**
 * Per-container cache of rendered mermaid SVG keyed by diagram source text.
 * Populated after each successful render; reused on subsequent renders to
 * avoid flicker when the preview HTML is regenerated (e.g. live markdown
 * editing). Entries for diagrams no longer present in the container are
 * evicted on each run so the cache can't grow unbounded.
 */
const mermaidSvgCache = new WeakMap<HTMLElement, Map<string, string>>();

export async function applyInlineMermaid(container: HTMLDivElement) {
    const nodes = Array.from(container.querySelectorAll<HTMLElement>("div.mermaid-diagram"));
    if (!nodes.length) return;

    let cache = mermaidSvgCache.get(container);
    if (!cache) {
        cache = new Map();
        mermaidSvgCache.set(container, cache);
    }

    // Paint cached SVGs upfront so unchanged diagrams don't flicker, and collect
    // only the new/changed diagrams for an actual mermaid render pass.
    const pendingSources = new Map<HTMLElement, string>();
    const seen = new Set<string>();
    for (const node of nodes) {
        const source = (node.textContent ?? "").trim();
        seen.add(source);
        const cached = cache.get(source);
        if (cached) {
            node.innerHTML = cached;
            node.setAttribute("data-processed", "true");
        } else {
            pendingSources.set(node, source);
        }
    }

    // Evict entries whose source is no longer present.
    for (const key of [ ...cache.keys() ]) {
        if (!seen.has(key)) cache.delete(key);
    }

    if (!pendingSources.size) return;

    const mermaid = (await import("mermaid")).default;
    mermaid.initialize(getMermaidConfig());
    try {
        await mermaid.run({ nodes: [ ...pendingSources.keys() ] });
        for (const [ node, source ] of pendingSources) {
            cache.set(source, node.innerHTML);
        }
    } catch (e) {
        console.log(e);
    }
}

async function renderChildrenList($renderedContent: JQuery<HTMLElement>, note: FNote, includeArchivedNotes: boolean) {
    let childNoteIds = note.getChildNoteIds();

    if (!childNoteIds.length) {
        return;
    }

    $renderedContent.addClass("text-with-ellipsis");

    // just load the first 10 child notes
    if (childNoteIds.length > 10) {
        childNoteIds = childNoteIds.slice(0, 10);
    }

    const childNotes = await froca.getNotes(childNoteIds);

    for (const childNote of childNotes) {
        if (childNote.isArchived && !includeArchivedNotes) continue;

        $renderedContent.append(
            await link.createLink(`${note.noteId}/${childNote.noteId}`, {
                showTooltip: false,
                showNoteIcon: true
            })
        );

        $renderedContent.append("<br>");
    }
}
