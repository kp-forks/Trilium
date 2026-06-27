/**
 * Imports an Obsidian vault (a zipped folder of Markdown files plus attachments) into a Trilium note tree.
 *
 * This pass reconstructs the *structure*: every `.md` file becomes a `text` note whose Markdown body is
 * rendered to HTML, and the vault's folder hierarchy is mirrored as the note tree (a folder becomes an empty
 * container note holding its notes). The `.obsidian/` config folder and any other dot-prefixed entry are
 * skipped, and non-Markdown files (attachments, `.canvas`, `.base`, …) are dropped for now.
 *
 * An Excalidraw-plugin drawing (`*.excalidraw.md`) is the exception to the "Markdown becomes a text note"
 * rule: it's decoded into a Trilium `canvas` note instead, with its embedded images saved as attachments
 * (see {@link ./excalidraw.js}).
 *
 * A vault can be zipped two ways — its *contents* (so `.obsidian/` sits at the zip root) or its *outer
 * folder* (so everything is nested under `Vault name/`). The location of `.obsidian/` pins the true vault
 * root either way, so the redundant wrapper folder is stripped and the import root is named after the vault.
 *
 * Obsidian-specific inline syntax is handled during Markdown rendering (gated by the `obsidian` flag):
 * `==highlight==` becomes `<mark>` and `%% comment %%` becomes an HTML comment.
 *
 * Front matter is parsed generically (see {@link ../frontmatter.js}) into camelCased labels, then Obsidian's
 * special keys are applied (see {@link ./frontmatter.js}): tags become individual labels, aliases become
 * `#alias` labels, and cssclasses/publish/permalink are dropped. Property typing (date/number/checkbox via
 * `.obsidian/types.json`) and callouts are deferred to later passes.
 *
 * Invoked from the shared file-import dispatcher (routes/api/import.ts) when the upload is tagged
 * `format=obsidian`, so progress, completion and failure are reported by that dispatcher's TaskContext —
 * this service just builds the tree and returns its root note, like the zip/notion/anytype importers.
 */

import { t } from "i18next";

import type BNote from "../../../becca/entities/bnote.js";
import noteService from "../../notes.js";
import protectedSessionService from "../../protected_session.js";
import type TaskContext from "../../task_context.js";
import { decodeUtf8 } from "../../utils/binary.js";
import { basename } from "../../utils/path.js";
import { getZipProvider } from "../../zip_provider.js";
import { toAttributeName } from "../collection_utils.js";
import { extractFrontmatter, type FrontmatterAttribute } from "../frontmatter.js";
import markdownService from "../markdown.js";
import { applyAttachments, type AttachmentIndex, buildAttachmentIndex, isImageMime, resolveAttachment } from "./attachments.js";
import { type ExcalidrawDrawing, isExcalidrawPath, parseExcalidraw } from "./excalidraw.js";
import { buildNoteIndex, resolveLinks } from "./links.js";

interface VaultNote {
    /** The note's vault-root-relative POSIX path, e.g. `Folder 1/First note.md` (the wrapper folder stripped). */
    path: string;
    title: string;
    markdown: string;
}

async function importObsidian(taskContext: TaskContext<"importNotes">, fileBuffer: Uint8Array, importRootNote: BNote, fileName?: string): Promise<BNote> {
    const { notes, attachments, vaultRoot } = await parseVault(fileBuffer);
    taskContext.setTotalCount(notes.length);

    return createNotes(importRootNote, notes, attachments, vaultTitle(vaultRoot, fileName), taskContext);
}

/**
 * Reads the vault zip, collecting one {@link VaultNote} per Markdown file. The vault root is detected from the
 * location of `.obsidian/` (see {@link detectVaultRoot}) and stripped from every note's path. The config
 * folder and any other dot-prefixed entry are skipped, as is every non-Markdown file (handled in later
 * passes). Sorted by path so the resulting tree is built (and ordered) deterministically.
 */
async function parseVault(fileBuffer: Uint8Array): Promise<{ notes: VaultNote[]; attachments: Map<string, Uint8Array>; vaultRoot: string }> {
    const provider = getZipProvider();
    const allPaths: string[] = [];
    const raw: { path: string; markdown: string }[] = [];
    const rawAttachments: { path: string; bytes: Uint8Array }[] = [];
    const filenameEncoding = await provider.detectFilenameEncoding(fileBuffer);

    await provider.readZipFile(fileBuffer, async (entry, readContent) => {
        const path = normalizePath(entry.fileName);
        if (isDirectory(path)) {
            return;
        }
        // Record every entry (including .obsidian/) so the vault root can be detected; only collect content
        // for the kept ones below.
        allPaths.push(path);
        if (isIgnored(path)) {
            return;
        }
        if (isMarkdown(path)) {
            raw.push({ path, markdown: decodeUtf8(await readContent()) });
        } else if (!isSpecial(path)) {
            // A non-Markdown, non-special file is a candidate attachment (`.canvas`/`.base` are handled later).
            rawAttachments.push({ path, bytes: await readContent() });
        }
    }, filenameEncoding);

    const vaultRoot = detectVaultRoot(allPaths);
    const notes = raw.map(({ path, markdown }) => {
        const relative = stripVaultRoot(path, vaultRoot);
        return { path: relative, title: noteTitle(relative), markdown };
    });
    notes.sort((a, b) => a.path.localeCompare(b.path));

    const attachments = new Map<string, Uint8Array>();
    for (const { path, bytes } of rawAttachments) {
        attachments.set(stripVaultRoot(path, vaultRoot), bytes);
    }

    return { notes, attachments, vaultRoot };
}

/**
 * Builds the note tree under a fresh import root named after the vault. Each note is parented under the
 * container note for its folder (created on demand by {@link ensureFolder}, so a folder note exists before
 * its children), with its Markdown rendered to HTML. Returns the import root.
 */
function createNotes(importRootNote: BNote, notes: VaultNote[], attachments: Map<string, Uint8Array>, rootTitle: string, taskContext: TaskContext<"importNotes">): BNote {
    /* v8 ignore next -- the protected branch needs a protected import root with an active protected session, which the in-memory test DB has no way to set up */
    const isProtected = !!(importRootNote.isProtected && protectedSessionService.isProtectedSessionAvailable());

    const rootNote = noteService.createNewNote({ parentNoteId: importRootNote.noteId, title: rootTitle, content: "", type: "text", mime: "text/html", isProtected }).note;
    rootNote.addLabel("iconClass", "bx bx-import");

    const attachmentIndex = buildAttachmentIndex(attachments);
    const shrinkImages = !!taskContext.data?.shrinkImages;
    // Folder path (POSIX) -> its container note. The empty path maps to the import root.
    const folderNotes = new Map<string, BNote>();
    const created: { note: BNote; path: string; rendered: string; content: string }[] = [];

    // First pass: create every note (so cross-note links can resolve below) with its Markdown rendered and
    // attachments saved. Content is persisted once, in the link pass, to avoid a second write per note.
    for (const vaultNote of notes) {
        const parent = ensureFolder(parentFolder(vaultNote.path), rootNote, folderNotes, isProtected);

        // An Obsidian Excalidraw drawing becomes a `canvas` note rather than rendered Markdown. It's still
        // added to `created` (with empty content) so other notes can wikilink to it, but it carries no HTML
        // for the link/attachment passes below. A drawing that can't be parsed falls through to text import.
        if (isExcalidrawPath(vaultNote.path)) {
            const note = createExcalidrawNote(parent, vaultNote, attachmentIndex, isProtected);
            if (note) {
                created.push({ note, path: vaultNote.path.replace(/\.excalidraw\.md$/i, ""), rendered: "", content: "" });
                taskContext.increaseProgressCount();
                continue;
            }
        }

        const { body, attributes } = extractFrontmatter(vaultNote.markdown);
        const rendered = markdownService.renderToHtml(body, vaultNote.title, { obsidian: true });
        const { note } = noteService.createNewNote({ parentNoteId: parent.noteId, title: vaultNote.title, content: rendered, type: "text", mime: "text/html", isProtected });

        // Front matter properties become labels (camelCased like the other importers), then Obsidian's special
        // keys are applied: tags become individual labels, aliases become #alias labels, and
        // cssclasses/publish/permalink are dropped. Property typing (date/number/checkbox) layers on later.
        for (const attribute of toObsidianLabels(attributes)) {
            note.addLabel(attribute.name, attribute.value);
        }

        // Attachments hang off the note, so this runs after creation; it returns the content with embedded
        // images/files rewritten to point at the saved attachments.
        const content = applyAttachments(note, rendered, attachmentIndex, shrinkImages);
        created.push({ note, path: vaultNote.path, rendered, content });
        taskContext.increaseProgressCount();
    }

    // Second pass: now that every note's name -> id is known, resolve wikilinks and note embeds to Trilium
    // internal links / include-notes, recording the relations that drive backlinks and "what links here".
    const noteIndex = buildNoteIndex(created);
    for (const { note, rendered, content } of created) {
        const { html, internalLinks, includeLinks } = resolveLinks(content, noteIndex);
        if (html !== rendered) {
            note.setContent(html);
        }
        for (const target of internalLinks) {
            note.addRelation("internalLink", target);
        }
        for (const target of includeLinks) {
            note.addRelation("includeNoteLink", target);
        }
    }

    return rootNote;
}

/**
 * Creates a `canvas` note from an Obsidian Excalidraw drawing, returning it (or `null` when the drawing can't
 * be parsed, so the caller can fall back to a text note). Each image the scene embeds is resolved against the
 * vault attachments and saved as an `image`-role attachment titled with its Excalidraw `fileId`, exactly how
 * the canvas editor stores images, so the scene's `fileId` references render on load.
 */
function createExcalidrawNote(parent: BNote, vaultNote: VaultNote, attachmentIndex: AttachmentIndex, isProtected: boolean): BNote | null {
    const drawing: ExcalidrawDrawing | null = parseExcalidraw(vaultNote.markdown);
    if (!drawing) {
        return null;
    }

    const { note } = noteService.createNewNote({ parentNoteId: parent.noteId, title: vaultNote.title, content: drawing.content, type: "canvas", mime: "application/json", isProtected });

    for (const [fileId, ref] of drawing.embeddedFiles) {
        const resolved = resolveAttachment(attachmentIndex, ref);
        if (resolved && isImageMime(resolved.mime)) {
            note.saveAttachment({ role: "image", mime: resolved.mime, title: fileId, content: resolved.bytes });
        }
    }

    return note;
}

const DROPPED_FRONTMATTER_KEYS = new Set(["cssclasses", "publish", "permalink"]);

/**
 * Applies Obsidian's special front matter property semantics on top of the generic parse: each `tags` value
 * becomes its own label (the sanitized tag as the name, e.g. `#book`), each `aliases` value becomes an
 * `#alias` label (the alternate name preserved), and `cssclasses`/`publish`/`permalink` are dropped
 * (presentation / publish-site metadata with no Trilium meaning). Every other property is left as-is.
 */
export function toObsidianLabels(attributes: FrontmatterAttribute[]): FrontmatterAttribute[] {
    const labels: FrontmatterAttribute[] = [];
    for (const { name, value } of attributes) {
        if (DROPPED_FRONTMATTER_KEYS.has(name)) {
            continue;
        }
        if (name === "tags") {
            if (value.trim()) {
                labels.push({ name: toAttributeName(value), value: "" });
            }
        } else if (name === "aliases") {
            if (value.trim()) {
                labels.push({ name: "alias", value });
            }
        } else {
            labels.push({ name, value });
        }
    }
    return labels;
}

/** Returns (creating on demand, parents first) the container note for `folderPath`; the empty path is the root. */
function ensureFolder(folderPath: string, rootNote: BNote, folderNotes: Map<string, BNote>, isProtected: boolean): BNote {
    if (folderPath === "") {
        return rootNote;
    }
    const cached = folderNotes.get(folderPath);
    if (cached) {
        return cached;
    }
    const parent = ensureFolder(parentFolder(folderPath), rootNote, folderNotes, isProtected);
    const { note } = noteService.createNewNote({ parentNoteId: parent.noteId, title: basename(folderPath), content: "", type: "text", mime: "text/html", isProtected });
    folderNotes.set(folderPath, note);
    return note;
}

/**
 * Determines the vault root to strip from every entry. The `.obsidian/` config folder always sits at the
 * true vault root, so the prefix before the *shallowest* `.obsidian/` is authoritative (empty when the
 * contents were zipped directly). When there is no `.obsidian/` (a stripped or non-vault zip), fall back to a
 * single wrapper folder shared by every entry; otherwise nothing is stripped.
 */
function detectVaultRoot(paths: string[]): string {
    let obsidianRoot: string | undefined;
    for (const path of paths) {
        const segments = path.split("/");
        const idx = segments.indexOf(".obsidian");
        if (idx === -1) {
            continue;
        }
        const prefix = idx === 0 ? "" : `${segments.slice(0, idx).join("/")}/`;
        if (obsidianRoot === undefined || prefix.length < obsidianRoot.length) {
            obsidianRoot = prefix;
        }
    }
    if (obsidianRoot !== undefined) {
        return obsidianRoot;
    }

    const first = paths[0]?.split("/")[0];
    if (first && paths.every((path) => path.startsWith(`${first}/`))) {
        return `${first}/`;
    }
    return "";
}

/** Strips the detected vault-root prefix from an entry path (a no-op when the root is the zip root). */
function stripVaultRoot(path: string, vaultRoot: string): string {
    return vaultRoot && path.startsWith(vaultRoot) ? path.slice(vaultRoot.length) : path;
}

/**
 * The import root's title: the stripped wrapper folder's name when the vault was zipped as a subfolder, else
 * the zip file's name (without extension), falling back to the generic "Obsidian import".
 */
function vaultTitle(vaultRoot: string, fileName?: string): string {
    if (vaultRoot) {
        return basename(vaultRoot.replace(/\/$/, "")) || t("obsidian_import.root-title");
    }
    if (fileName) {
        const base = basename(normalizePath(fileName)).replace(/\.zip$/i, "").trim();
        if (base) {
            return base;
        }
    }
    return t("obsidian_import.root-title");
}

/** The POSIX parent-folder path of `path` (everything before the last `/`), or `""` when at the vault root. */
function parentFolder(path: string): string {
    const slash = path.lastIndexOf("/");
    return slash === -1 ? "" : path.slice(0, slash);
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/");
}

/** A zip directory entry (trailing slash) carries no content. */
function isDirectory(path: string): boolean {
    return path.endsWith("/");
}

/** Skips the `.obsidian/` config folder and every other dot-prefixed entry (`.trash/`, `.DS_Store`, …). */
function isIgnored(path: string): boolean {
    return path.split("/").some((segment) => segment.startsWith("."));
}

function isMarkdown(path: string): boolean {
    return path.toLowerCase().endsWith(".md");
}

/** `.canvas` (whiteboards) and `.base` (Bases) get dedicated handling later, so they're not attachments. */
function isSpecial(path: string): boolean {
    return /\.(canvas|base)$/i.test(path);
}

/**
 * The note title for a Markdown file: its base name without the `.md` extension. An Excalidraw drawing drops
 * its full `.excalidraw.md` suffix so the note is titled like Obsidian shows it (e.g. `Drawing 2026-…`).
 */
function noteTitle(path: string): string {
    const base = basename(path);
    if (isExcalidrawPath(base)) {
        return base.replace(/\.excalidraw\.md$/i, "");
    }
    return base.replace(/\.md$/i, "");
}

export default { importObsidian };
