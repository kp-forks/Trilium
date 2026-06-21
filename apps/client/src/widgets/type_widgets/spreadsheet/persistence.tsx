import { CommandType, FUniver, IDisposable, IWorkbookData, LocaleType } from "@univerjs/presets";
import { MutableRef, useEffect, useRef } from "preact/hooks";

import NoteContext from "../../../components/note_context";
import FNote from "../../../entities/fnote";
import server from "../../../services/server";
import { randomString } from "../../../services/utils";
import { SavedData, useEditorSpacedUpdate } from "../../react/hooks";

interface PersistedData {
    version: number;
    workbook: Parameters<FUniver["createWorkbook"]>[0];
}

interface SpreadsheetViewState {
    activeSheetId?: string;
    cursorRow?: number;
    cursorCol?: number;
    scrollRow?: number;
    scrollCol?: number;
}

export default function usePersistence(note: FNote, noteContext: NoteContext | null | undefined, apiRef: MutableRef<FUniver | undefined>, containerRef: MutableRef<HTMLDivElement | null>) {
    const changeListener = useRef<IDisposable>(null);
    const pendingContent = useRef<string | null>(null);
    // Set when a value edit has been made whose formula recalculation hasn't been
    // applied yet. getData() waits for that pending recalc before serializing, so a
    // save can't persist pre-recalc (stale) formula results.
    const recalcPending = useRef(false);
    // Maps an inserted image's base64 source to the attachment URL it was uploaded to, so each image
    // is uploaded once and reused across the repeated saves of one editing session. Reset on load.
    const uploadedImageUrls = useRef<Map<string, string>>(new Map());
    // Base64 images already present in the loaded content. Left as-is on save (we only convert newly
    // inserted images to attachments — existing notes are not migrated).
    const preexistingImageSources = useRef<Set<string>>(new Set());

    function saveViewState(univerAPI: FUniver): SpreadsheetViewState {
        const state: SpreadsheetViewState = {};
        try {
            const workbook = univerAPI.getActiveWorkbook();
            if (!workbook) return state;

            const activeSheet = workbook.getActiveSheet();
            state.activeSheetId = activeSheet?.getSheetId();

            const currentCell = activeSheet?.getSelection()?.getCurrentCell();
            if (currentCell) {
                state.cursorRow = currentCell.actualRow;
                state.cursorCol = currentCell.actualColumn;
            }

            const scrollState = activeSheet?.getScrollState?.();
            if (scrollState) {
                state.scrollRow = scrollState.sheetViewStartRow;
                state.scrollCol = scrollState.sheetViewStartColumn;
            }
        } catch {
            // Ignore errors when reading state from a workbook being disposed.
        }
        return state;
    }

    function restoreViewState(workbook: ReturnType<FUniver["createWorkbook"]>, state: SpreadsheetViewState) {
        try {
            if (state.activeSheetId) {
                const targetSheet = workbook.getSheetBySheetId(state.activeSheetId);
                if (targetSheet) {
                    workbook.setActiveSheet(targetSheet);
                }
            }
            if (state.cursorRow !== undefined && state.cursorCol !== undefined) {
                workbook.getActiveSheet().getRange(state.cursorRow, state.cursorCol).activate();
            }
            if (state.scrollRow !== undefined && state.scrollCol !== undefined) {
                workbook.getActiveSheet().scrollToCell(state.scrollRow, state.scrollCol);
            }
        } catch {
            // Ignore errors when restoring state (e.g. sheet no longer exists).
        }
    }

    function applyContent(univerAPI: FUniver, newContent: string) {
        const viewState = saveViewState(univerAPI);
        const existingWorkbook = univerAPI.getActiveWorkbook();

        let workbookData: Partial<IWorkbookData> = {};
        if (newContent) {
            try {
                const parsedContent = JSON.parse(newContent) as unknown;
                if (parsedContent && typeof parsedContent === "object" && "workbook" in parsedContent) {
                    const persistedData = parsedContent as PersistedData;
                    workbookData = persistedData.workbook;
                }
            } catch (e) {
                console.error("Failed to parse spreadsheet content", e);
            }
        }

        // Snapshot the base64 images already in the loaded content so the save-time upload leaves them
        // untouched (only newly inserted images become attachments), and start the per-session
        // base64 -> attachment-URL map fresh for this workbook.
        preexistingImageSources.current = collectBase64DrawingSources(workbookData);
        uploadedImageUrls.current = new Map();

        // Always assign a fresh unit id. The persisted id is reused verbatim, but the
        // new workbook is created below BEFORE the old one is disposed, so a stale or
        // shared id (e.g. a duplicated/cloned note, or this note's content being
        // re-applied) would collide in Univer's unit registry and throw. The id is
        // ephemeral — view state keys off the sheet id, not the workbook id.
        workbookData.id = randomString();

        // Pin the workbook locale to the only locale bundle the editor registers (see
        // Spreadsheet.tsx). Univer's workbook model otherwise defaults a missing locale
        // to "zhCN", which mismatches the English UI; pinning it here keeps new and
        // loaded workbooks consistent and lets the persisted value be dropped on save.
        workbookData.locale = LocaleType.EN_US;

        // Create the new workbook BEFORE disposing the old one so the formula
        // engine transitions cleanly without a gap where stale state could leak.
        const workbook = univerAPI.createWorkbook(workbookData);

        if (existingWorkbook) {
            univerAPI.disposeUnit(existingWorkbook.getId());
        }

        restoreViewState(workbook, viewState);

        if (changeListener.current) {
            changeListener.current.dispose();
        }
        changeListener.current = workbook.onCommandExecuted(command => {
            if (command.type !== CommandType.MUTATION) return;

            // A value write triggered by a command (a user edit, paste, fill, …) will be
            // followed by a formula recalc. Mark it so the next save waits for that recalc
            // to be applied before serializing. Recalc *result* writes carry no trigger,
            // so they don't re-arm this (the completion handler below clears it).
            const params = (command as { params?: { trigger?: string } }).params;
            if (command.id === "sheet.mutation.set-range-values" && params?.trigger) {
                recalcPending.current = true;
            }

            spacedUpdate.scheduleUpdate();
        });
    }

    function isContainerVisible() {
        const el = containerRef.current;
        if (!el) return false;
        return el.offsetWidth > 0 && el.offsetHeight > 0;
    }

    const spacedUpdate = useEditorSpacedUpdate({
        noteType: "spreadsheet",
        note,
        noteContext,
        async getData() {
            const univerAPI = apiRef.current;
            if (!univerAPI) return undefined;
            const workbook = univerAPI.getActiveWorkbook();
            if (!workbook) return undefined;

            // If a value edit's recalc hasn't been applied yet, wait for it before
            // serializing — otherwise the save can persist stale (even garbage) formula
            // results, since a save can be triggered by the edit mutation itself, ahead
            // of Univer's debounced recalc. We wait for the *natural incremental* recalc
            // (only the affected cells), not a forced full recalc, so this stays cheap on
            // large sheets. onCalculationResultApplied resolves when results are written
            // to the cells, falls through quickly if nothing computes, and has its own
            // timeout, so it can't stall the save.
            if (recalcPending.current) {
                try {
                    await univerAPI.getFormula?.()?.onCalculationResultApplied?.();
                } catch {
                    // Backstop timeout tripped — serialize the current state rather than block the save.
                }
                recalcPending.current = false;
            }

            const saved = workbook.save();
            const slimmed = slimWorkbookData(saved);

            const attachments: SavedData["attachments"] = [];
            const canvasEl = containerRef.current?.querySelector<HTMLCanvasElement>("canvas[id]");
            if (canvasEl) {
                const dataUrl = canvasEl.toDataURL("image/png");
                const base64 = dataUrl.split(",")[1];
                attachments.push({
                    role: "image",
                    title: "spreadsheet-export.png",
                    mime: "image/png",
                    content: base64,
                    position: 0,
                    encoding: "base64"
                });
            }

            // Upload newly inserted base64 images as attachments and rewrite their workbook sources
            // to the returned api/attachments/... URLs (mutates `slimmed`) so they no longer bloat
            // the note content. Existing base64 images are left in place (see preexistingImageSources).
            await uploadNewDrawingImages(
                slimmed,
                preexistingImageSources.current,
                uploadedImageUrls.current,
                (source) => uploadDrawingImage(note.noteId, source)
            );

            const content = {
                version: 1,
                workbook: slimmed
            };

            return {
                content: JSON.stringify(content),
                attachments
            };
        },
        onContentChange(newContent) {
            const univerAPI = apiRef.current;
            if (!univerAPI) return undefined;

            // Defer content application if the container is hidden (zero size),
            // since the spreadsheet library cannot calculate layout in that state.
            if (!isContainerVisible()) {
                pendingContent.current = newContent;
                return;
            }

            pendingContent.current = null;
            applyContent(univerAPI, newContent);
        },
    });

    // Apply pending content once the container becomes visible (non-zero size).
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver(() => {
            if (pendingContent.current === null || !isContainerVisible()) return;

            const univerAPI = apiRef.current;
            if (!univerAPI) return;

            const content = pendingContent.current;
            pendingContent.current = null;
            applyContent(univerAPI, content);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable: applyContent/isContainerVisible use refs
    }, [ containerRef ]);

    useEffect(() => {
        return () => {
            if (changeListener.current) {
                changeListener.current.dispose();
                changeListener.current = null;
            }
        };
    }, []);

    // Clear the pending flag as soon as a recalc's results are applied, so a debounced
    // save that fires well after the recalc already settled serializes immediately
    // instead of waiting on onCalculationResultApplied's idle timeout.
    useEffect(() => {
        const formula = apiRef.current?.getFormula?.();
        if (!formula) {
            // The eager-clear optimization is disabled without it; getData() still falls back
            // to onCalculationResultApplied's timeout, so saves stay correct (just slower).
            console.warn("Spreadsheet formula service unavailable; recalc-pending flag will not be cleared eagerly.");
            return;
        }
        const disposable = formula.calculationResultApplied(() => {
            recalcPending.current = false;
        });
        return () => disposable?.dispose?.();
    }, [ apiRef ]);
}

/**
 * Trims fields from the workbook data that are dead weight in the saved payload:
 *
 * - The top-level workbook `id` and `locale` are both reassigned on every load (see
 *   `applyContent`), so the persisted values are never read — dropping them is lossless.
 * - Plugin resources whose `data` carries no information (empty string or "{}") are
 *   removed. Univer leaves an absent resource's plugin at its default (empty) state
 *   on load, which is identical to restoring these.
 *
 * Mutates the input in place: `workbook.save()` already returns a fresh, deep-cloned
 * snapshot that the caller owns, so there is nothing live to protect.
 */
export function slimWorkbookData(workbookData: IWorkbookData): Partial<IWorkbookData> {
    const slimmed = workbookData as Partial<IWorkbookData>;
    delete slimmed.id;
    delete slimmed.locale;

    if (slimmed.resources) {
        slimmed.resources = slimmed.resources.filter(
            resource => resource.data !== "" && resource.data !== "{}"
        );
    }
    return slimmed;
}

/** Univer's resource key under which the sheet drawing (image) layer is serialized in the workbook. */
const DRAWING_RESOURCE_NAME = "SHEET_DRAWING_PLUGIN";

/**
 * Uploads newly inserted base64 images in a saved workbook as Trilium attachments and rewrites their
 * drawing-resource `source` from the inline data URL to the returned `api/attachments/...` URL (with
 * `imageSourceType` switched to `URL`), so images live as attachments instead of bloating the note
 * content.
 *
 * - `preexisting` holds base64 sources already in the loaded content; those are left untouched so
 *   existing notes are not migrated.
 * - `uploadedUrls` caches each base64 source's resulting URL, so an image is uploaded once and
 *   reused across the session's repeated saves rather than re-uploaded each time.
 * - `upload` performs the actual upload and resolves to the attachment URL, or `null` on failure
 *   (in which case the image is left as base64 so it still persists and renders).
 *
 * Mutates `workbookData` (re-serializing the drawing resource) when any source changed.
 */
export async function uploadNewDrawingImages(
    workbookData: Partial<IWorkbookData>,
    preexisting: ReadonlySet<string>,
    uploadedUrls: Map<string, string>,
    upload: (source: string) => Promise<string | null>
): Promise<void> {
    const targets: { node: Record<string, unknown>; source: string }[] = [];
    const walked = forEachBase64DrawingImage(workbookData, (node, source) => {
        if (!preexisting.has(source)) {
            targets.push({ node, source });
        }
    });
    if (!walked || targets.length === 0) return;

    let mutated = false;
    for (const { node, source } of targets) {
        let url = uploadedUrls.get(source);
        if (!url) {
            const uploaded = await upload(source);
            if (!uploaded) continue; // upload failed — leave as base64 so it still persists/renders
            url = uploaded;
            uploadedUrls.set(source, url);
        }
        node.source = url;
        node.imageSourceType = "URL";
        mutated = true;
    }

    if (mutated) {
        walked.resource.data = JSON.stringify(walked.drawingData);
    }
}

/**
 * Uploads a base64 image to the note as an attachment via the standard attachment-upload endpoint
 * (the server assigns the id and returns the reference URL). Resolves to the URL, or `null` on
 * failure.
 */
async function uploadDrawingImage(noteId: string, source: string): Promise<string | null> {
    const file = dataUrlToImageFile(source);
    if (!file) return null;

    try {
        const response = await server.upload(`notes/${noteId}/attachments/upload`, file, undefined, "POST") as { uploaded?: boolean; url?: string };
        return response?.uploaded && response.url ? response.url : null;
    } catch (e) {
        console.error("Failed to upload spreadsheet image", e);
        return null;
    }
}

/** Decodes a `data:<mime>;base64,<data>` URL into a {@link File} for upload. */
function dataUrlToImageFile(dataUrl: string): File | null {
    const parsed = parseImageDataUrl(dataUrl);
    if (!parsed) return null;

    const binary = atob(parsed.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new File([ bytes ], `image.${parsed.ext}`, { type: parsed.mime });
}

/** Collects the base64 image sources currently present in a workbook's drawing resource. */
export function collectBase64DrawingSources(workbookData: Partial<IWorkbookData>): Set<string> {
    const sources = new Set<string>();
    forEachBase64DrawingImage(workbookData, (_node, source) => sources.add(source));
    return sources;
}

interface DrawingResource {
    resource: { name: string; data: string };
    drawingData: unknown;
}

/**
 * Walks the drawing resource of a saved workbook, invoking `callback` for every base64 image node
 * (an object with `imageSourceType === "BASE64"` and a `data:` `source`). The callback may mutate
 * the node in place. Returns the parsed drawing data and its resource so callers can re-serialize
 * after mutating, or `null` when there is no drawing resource / it fails to parse.
 */
function forEachBase64DrawingImage(
    workbookData: Partial<IWorkbookData>,
    callback: (node: Record<string, unknown>, source: string) => void
): DrawingResource | null {
    const resource = workbookData.resources?.find((r) => r.name === DRAWING_RESOURCE_NAME);
    if (!resource?.data) return null;

    let drawingData: unknown;
    try {
        drawingData = JSON.parse(resource.data);
    } catch {
        return null;
    }

    const visit = (value: unknown) => {
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (!value || typeof value !== "object") return;

        const node = value as Record<string, unknown>;
        if (node.imageSourceType === "BASE64" && typeof node.source === "string" && node.source.startsWith("data:")) {
            callback(node, node.source);
            return;
        }
        for (const key of Object.keys(node)) {
            visit(node[key]);
        }
    };
    visit(drawingData);

    return { resource, drawingData };
}

interface ParsedImageDataUrl {
    mime: string;
    base64: string;
    ext: string;
}

/** Splits a `data:<mime>;base64,<data>` URL into its mime, raw base64 and a file extension. */
function parseImageDataUrl(dataUrl: string): ParsedImageDataUrl | null {
    const match = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl);
    if (!match) return null;

    const mime = match[1];
    const base64 = match[2];
    const subtype = mime.split("/")[1] ?? "png";
    const ext = subtype === "svg+xml" ? "svg" : (subtype.replace(/[^a-z0-9]/gi, "") || "png");
    return { mime, base64, ext };
}
