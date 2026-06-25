/**
 * Imports an Anytype JSON ("any-block") export zip into a Trilium note tree.
 *
 * Anytype exports each object as a single `objects/<cid>.pb.json` file (the protobuf export uses `.pb`
 * instead — not handled here), alongside sibling `relations/`, `types/`, `templates/` and `relationsOptions/`
 * folders. This first version is deliberately minimal: it imports only *pages* (basic note-like objects) and
 * their plain text, dropping inline formatting, links, relations, types and collections. Every imported page
 * lands as a flat child of a fresh "Anytype import" root; hierarchy, formatting and structured data are left
 * for later iterations.
 *
 * Invoked from the shared file-import dispatcher (routes/api/import.ts) when the upload is tagged
 * `format=anytype`, so progress, completion and failure are reported by that dispatcher's TaskContext —
 * this service just builds the tree and returns its root note, like the zip/notion importers.
 */

import { t } from "i18next";

import type BNote from "../../../becca/entities/bnote.js";
import noteService from "../../notes.js";
import protectedSessionService from "../../protected_session.js";
import type TaskContext from "../../task_context.js";
import { getZipProvider } from "../../zip_provider.js";
import type { AnytypeBlock, AnytypeSnapshot, ParsedObject } from "./model.js";

async function importAnytype(taskContext: TaskContext<"importNotes">, fileBuffer: Uint8Array, importRootNote: BNote): Promise<BNote> {
    const snapshots = await parseZip(fileBuffer);
    const pages = snapshots.filter(isPage).map(parseObject);
    taskContext.setTotalCount(pages.length);

    return createNotes(importRootNote, pages, taskContext);
}

/**
 * Reads every `objects/*.pb.json` entry as a parsed Anytype snapshot. Sibling folders (relations, types, …)
 * and the protobuf `.pb` files are ignored for now. A malformed entry is skipped rather than failing the
 * whole import.
 */
async function parseZip(fileBuffer: Uint8Array): Promise<AnytypeSnapshot[]> {
    const provider = getZipProvider();
    const snapshots: AnytypeSnapshot[] = [];
    const filenameEncoding = await provider.detectFilenameEncoding(fileBuffer);

    await provider.readZipFile(fileBuffer, async (entry, readContent) => {
        if (!isObjectEntry(entry.fileName)) {
            return;
        }
        try {
            snapshots.push(JSON.parse(new TextDecoder().decode(await readContent())) as AnytypeSnapshot);
        } catch {
            // A non-JSON or truncated entry under objects/ isn't a page we can import — skip it.
        }
    }, filenameEncoding);

    return snapshots;
}

/** True for entries that are JSON object files under the export's `objects/` folder. */
function isObjectEntry(fileName: string): boolean {
    const normalized = fileName.replace(/\\/g, "/").toLowerCase();
    return normalized.startsWith("objects/") && normalized.endsWith(".pb.json");
}

/**
 * Whether a snapshot is a page we should import. A page is a `Page` smartblock with the basic layout (0);
 * this excludes sets/collections (layout 3) and system objects like the participant, workspace and
 * dashboard widget. Conservative on purpose — other content layouts can be admitted as the importer grows.
 *
 * Anytype omits `layout` when it's the default (Basic = 0) — a single-object export of a basic page has no
 * `layout` field at all — so we fall back to `resolvedLayout` (always present) and treat a wholly missing
 * value as basic. Sets and other non-page layouts are still excluded by their non-zero value.
 */
export function isPage(snapshot: AnytypeSnapshot): boolean {
    if (snapshot.sbType !== "Page") {
        return false;
    }
    const details = snapshot.snapshot?.data?.details;
    const layout = details?.layout ?? details?.resolvedLayout ?? 0;
    return layout === 0;
}

/** Reduces a page snapshot to the title and plain-text body needed to create a note. */
export function parseObject(snapshot: AnytypeSnapshot): ParsedObject {
    const data = snapshot.snapshot?.data;
    const details = data?.details ?? {};
    const id = details.id ?? "";
    const title = (details.name ?? "").trim() || "Untitled";
    const content = extractTextContent(data?.blocks ?? [], id);

    return { id, title, content };
}

/**
 * Walks the block tree from the root in document order, emitting each non-empty text block as a `<p>`. The
 * `header` subtree (title/description/featuredRelations chrome) is skipped, as are the structural Title and
 * Description styles wherever they appear. Formatting (marks), links and other block kinds are ignored for
 * now — only the text is pulled out.
 */
function extractTextContent(blocks: AnytypeBlock[], rootId: string): string {
    const byId = new Map<string, AnytypeBlock>();
    for (const block of blocks) {
        byId.set(block.id, block);
    }

    const root = (rootId ? byId.get(rootId) : undefined) ?? blocks[0];
    if (!root) {
        return "";
    }

    const paragraphs: string[] = [];
    const visited = new Set<string>();

    const walk = (id: string) => {
        // The header holds title/description chrome, not body content; cycle-guard everything else.
        if (id === "header" || visited.has(id)) {
            return;
        }
        visited.add(id);

        const block = byId.get(id);
        if (!block) {
            return;
        }

        const text = block.text?.text?.trim();
        const style = block.text?.style;
        if (text && style !== "Title" && style !== "Description") {
            paragraphs.push(`<p>${escapeHtml(text)}</p>`);
        }

        for (const childId of block.childrenIds ?? []) {
            walk(childId);
        }
    };

    // The root block is the page container and carries no text of its own — start from its children.
    for (const childId of root.childrenIds ?? []) {
        walk(childId);
    }

    return paragraphs.join("");
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Creates a fresh "Anytype import" root and a flat child note per page. */
function createNotes(importRootNote: BNote, pages: ParsedObject[], taskContext: TaskContext<"importNotes">): BNote {
    /* v8 ignore next -- the protected branch needs a protected import root with an active protected session, which the in-memory test DB has no way to set up */
    const isProtected = importRootNote.isProtected && protectedSessionService.isProtectedSessionAvailable();

    const rootNote = noteService.createNewNote({ parentNoteId: importRootNote.noteId, title: t("anytype_import.root-title"), content: "", type: "text", mime: "text/html", isProtected }).note;
    rootNote.addLabel("iconClass", "bx bx-import");

    for (const page of pages) {
        noteService.createNewNote({ parentNoteId: rootNote.noteId, title: page.title, content: page.content, type: "text", mime: "text/html", isProtected });
        taskContext.increaseProgressCount();
    }

    return rootNote;
}

export default { importAnytype };
