// PDF annotation type constants (from PDF spec / pdfjs-dist AnnotationType)
export const AnnotationType = {
    TEXT: 1,
    LINK: 2,
    FREETEXT: 3,
    LINE: 4,
    SQUARE: 5,
    CIRCLE: 6,
    POLYGON: 7,
    POLYLINE: 8,
    HIGHLIGHT: 9,
    UNDERLINE: 10,
    SQUIGGLY: 11,
    STRIKEOUT: 12,
    STAMP: 13,
    CARET: 14,
    INK: 15,
    POPUP: 16,
    FILEATTACHMENT: 17
} as const;

/** Annotation types that carry user-visible comments or markup. */
const COMMENT_TYPES = new Set([
    AnnotationType.TEXT,
    AnnotationType.FREETEXT,
    AnnotationType.HIGHLIGHT,
    AnnotationType.UNDERLINE,
    AnnotationType.SQUIGGLY,
    AnnotationType.STRIKEOUT,
    AnnotationType.INK,
    AnnotationType.STAMP,
    AnnotationType.LINE,
    AnnotationType.SQUARE,
    AnnotationType.CIRCLE,
    AnnotationType.POLYGON,
    AnnotationType.POLYLINE,
    AnnotationType.CARET
]);

const TYPE_NAMES: Record<number, string> = {
    [AnnotationType.TEXT]: "text",
    [AnnotationType.FREETEXT]: "freetext",
    [AnnotationType.HIGHLIGHT]: "highlight",
    [AnnotationType.UNDERLINE]: "underline",
    [AnnotationType.SQUIGGLY]: "squiggly",
    [AnnotationType.STRIKEOUT]: "strikeout",
    [AnnotationType.INK]: "ink",
    [AnnotationType.STAMP]: "stamp",
    [AnnotationType.LINE]: "line",
    [AnnotationType.SQUARE]: "square",
    [AnnotationType.CIRCLE]: "circle",
    [AnnotationType.POLYGON]: "polygon",
    [AnnotationType.POLYLINE]: "polyline",
    [AnnotationType.CARET]: "caret"
};

/**
 * Process a raw PDF.js annotation object into a normalized PdfAnnotationInfo,
 * or return null if it should be skipped.
 */
export function processAnnotation(ann: Record<string, any>, pageNumber: number): PdfAnnotationInfo | null {
    if (!COMMENT_TYPES.has(ann.annotationType)) {
        return null;
    }

    const contents = ann.contentsObj?.str || "";
    const highlightedText = ann.overlaidText || "";

    // Skip annotations that have no meaningful content
    if (!contents && !highlightedText) {
        return null;
    }

    return {
        id: ann.id,
        type: TYPE_NAMES[ann.annotationType] ?? "unknown",
        contents,
        highlightedText,
        author: ann.titleObj?.str || "",
        pageNumber,
        color: ann.color ? rgbToHex(ann.color) : null,
        creationDate: ann.creationDate || null,
        modificationDate: ann.modificationDate || null
    };
}

export async function setupPdfAnnotations() {
    await extractAndSendAnnotations();

    window.addEventListener("message", (event) => {
        if (event.origin !== window.location.origin) return;

        if (event.data?.type === "trilium-scroll-to-annotation") {
            scrollToAnnotation(event.data.annotationId, event.data.pageNumber);
        }
    });
}

/**
 * Must be called AFTER manageSave() so we can chain onto the
 * onSetModified callback it installs.
 */
export function setupAnnotationLiveUpdates() {
    const app = window.PDFViewerApplication!;
    const storage = app.pdfDocument.annotationStorage;

    let debounceTimer: number | null = null;
    const debouncedRefresh = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => extractAndSendAnnotations(), 500);
    };

    // Chain onto the existing onSetModified set by manageSave.
    // Fires when annotations are added/removed.
    const previousOnSetModified = (storage as any).onSetModified;
    (storage as any).onSetModified = () => {
        previousOnSetModified?.();
        debouncedRefresh();
    };

    // Fires when editor properties change (e.g. color, thickness).
    app.eventBus.on("annotationeditorparamschanged", debouncedRefresh);
}

async function extractAndSendAnnotations() {
    const app = window.PDFViewerApplication;
    try {
        const annotations = await extractFromDocument(app.pdfDocument);
        applyEditorOverrides(annotations, app.pdfDocument.annotationStorage);
        sendAnnotations(annotations);
    } catch (error) {
        console.error("Error extracting annotations:", error);
        sendAnnotations([]);
    }
}

/**
 * Re-extract annotations from freshly saved PDF bytes.
 * Opens a temporary document to read the latest data (including
 * newly created highlights with their overlaidText), then closes it.
 */
export async function extractFromSavedData(data: ArrayBuffer | Uint8Array) {
    try {
        const tempDoc = await (globalThis as any).pdfjsLib.getDocument({ data }).promise;
        const annotations = await extractFromDocument(tempDoc);
        tempDoc.destroy();
        sendAnnotations(annotations);
    } catch (error) {
        console.error("Error extracting annotations from saved data:", error);
    }
}

async function extractFromDocument(pdfDocument: any): Promise<PdfAnnotationInfo[]> {
    const numPages = pdfDocument.numPages;
    const annotations: PdfAnnotationInfo[] = [];

    for (let i = 1; i <= numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const pageAnnotations = await page.getAnnotations({ intent: "display" });

        for (const ann of pageAnnotations) {
            const processed = processAnnotation(ann, i);
            if (processed) {
                annotations.push(processed);
            }
        }
    }

    return annotations;
}

function applyEditorOverrides(annotations: PdfAnnotationInfo[], storage: any) {
    for (const ann of annotations) {
        const editor = storage.getEditor?.(ann.id);
        if (!editor) continue;
        if (editor.deleted) {
            annotations.splice(annotations.indexOf(ann), 1);
            continue;
        }
        if (editor.color) {
            ann.color = editor.color;
        }
        if (editor.comment?.text) {
            ann.contents = editor.comment.text;
        }
    }
}

function sendAnnotations(annotations: PdfAnnotationInfo[]) {
    window.parent.postMessage({
        type: "pdfjs-viewer-annotations",
        annotations
    } satisfies PdfViewerAnnotationsMessage, window.location.origin);
}

function scrollToAnnotation(annotationId: string, pageNumber: number) {
    const app = window.PDFViewerApplication;

    // Try to find the element directly (nearby pages are pre-rendered)
    const el = document.querySelector(`[data-annotation-id="${CSS.escape(annotationId)}"]`);
    if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }

    // Element not in DOM yet — jump to the page and wait for it to render
    app.pdfViewer.currentPageNumber = pageNumber;
    const observer = new MutationObserver(() => {
        const el = document.querySelector(`[data-annotation-id="${CSS.escape(annotationId)}"]`);
        if (el) {
            observer.disconnect();
            el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    });
    observer.observe(document.getElementById("viewer")!, { childList: true, subtree: true });
    // Clean up if annotation never appears
    setTimeout(() => observer.disconnect(), 3000);
}

export function rgbToHex(rgb: Uint8ClampedArray | Record<number, number> | number[]): string {
    const r = rgb[0];
    const g = rgb[1];
    const b = rgb[2];
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
