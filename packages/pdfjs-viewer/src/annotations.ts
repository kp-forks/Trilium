// PDF annotation type constants (from PDF spec / pdfjs-dist AnnotationType)
const AnnotationType = {
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

export async function setupPdfAnnotations() {
    await extractAndSendAnnotations();

    window.addEventListener("message", (event) => {
        if (event.origin !== window.location.origin) return;

        if (event.data?.type === "trilium-scroll-to-annotation") {
            scrollToAnnotation(event.data.pageNumber);
        }
    });
}

async function extractAndSendAnnotations() {
    const app = window.PDFViewerApplication;

    try {
        const numPages = app.pdfDocument.numPages;
        const annotations: PdfAnnotationInfo[] = [];

        for (let i = 1; i <= numPages; i++) {
            const page = await app.pdfDocument.getPage(i);
            const pageAnnotations = await page.getAnnotations({ intent: "display" });

            for (const ann of pageAnnotations) {
                if (!COMMENT_TYPES.has(ann.annotationType)) continue;
                // Skip annotations that have no meaningful content
                if (!ann.contents && !ann.richText && ann.annotationType !== AnnotationType.HIGHLIGHT) continue;

                annotations.push({
                    id: ann.id,
                    type: TYPE_NAMES[ann.annotationType] ?? "unknown",
                    contents: ann.contents || "",
                    author: ann.titleObj?.str || "",
                    pageNumber: i,
                    color: ann.color ? rgbToHex(ann.color) : null,
                    creationDate: ann.creationDate || null,
                    modificationDate: ann.modificationDate || null
                });
            }
        }

        window.parent.postMessage({
            type: "pdfjs-viewer-annotations",
            annotations
        } satisfies PdfViewerAnnotationsMessage, window.location.origin);
    } catch (error) {
        console.error("Error extracting annotations:", error);
        window.parent.postMessage({
            type: "pdfjs-viewer-annotations",
            annotations: []
        } satisfies PdfViewerAnnotationsMessage, window.location.origin);
    }
}

function scrollToAnnotation(pageNumber: number) {
    const app = window.PDFViewerApplication;
    app.pdfViewer.currentPageNumber = pageNumber;
}

function rgbToHex(rgb: Uint8ClampedArray | number[]): string {
    const r = rgb[0];
    const g = rgb[1];
    const b = rgb[2];
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
