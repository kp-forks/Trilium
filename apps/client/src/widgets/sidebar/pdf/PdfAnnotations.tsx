import "./PdfAnnotations.css";

import { t } from "../../../services/i18n";
import { useActiveNoteContext, useGetContextData, useNoteProperty } from "../../react/hooks";
import Icon from "../../react/Icon";
import RightPanelWidget from "../RightPanelWidget";

const TYPE_ICONS: Record<string, string> = {
    text: "bx bxs-comment-detail",
    freetext: "bx bx-text",
    highlight: "bx bx-highlight",
    underline: "bx bx-underline",
    squiggly: "bx bx-water",
    strikeout: "bx bx-strikethrough",
    ink: "bx bx-pen",
    stamp: "bx bx-stamp",
    line: "bx bx-minus",
    square: "bx bx-rectangle",
    circle: "bx bx-circle",
    polygon: "bx bx-shape-polygon",
    polyline: "bx bx-git-branch",
    caret: "bx bx-caret-up"
};

export default function PdfAnnotations() {
    const { note } = useActiveNoteContext();
    const noteType = useNoteProperty(note, "type");
    const noteMime = useNoteProperty(note, "mime");
    const annotationsData = useGetContextData("pdfAnnotations");

    if (noteType !== "file" || noteMime !== "application/pdf") {
        return null;
    }

    if (!annotationsData || annotationsData.annotations.length === 0) {
        return null;
    }

    // Group annotations by page
    const byPage = new Map<number, PdfAnnotationInfo[]>();
    for (const ann of annotationsData.annotations) {
        let list = byPage.get(ann.pageNumber);
        if (!list) {
            list = [];
            byPage.set(ann.pageNumber, list);
        }
        list.push(ann);
    }

    const pages = [...byPage.entries()].sort((a, b) => a[0] - b[0]);

    return (
        <RightPanelWidget id="pdf-annotations" title={t("pdf.annotations", { count: annotationsData.annotations.length })}>
            <div className="pdf-annotations-list">
                {pages.map(([pageNumber, annotations]) => (
                    <div key={pageNumber} className="pdf-annotations-page-group">
                        <div className="pdf-annotations-page-header">
                            {t("pdf.annotations_page", { page: pageNumber })}
                        </div>
                        {annotations.map((annotation) => (
                            <PdfAnnotationItem
                                key={annotation.id}
                                annotation={annotation}
                                onNavigate={annotationsData.scrollToAnnotation}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </RightPanelWidget>
    );
}

function PdfAnnotationItem({
    annotation,
    onNavigate
}: {
    annotation: PdfAnnotationInfo;
    onNavigate: (pageNumber: number) => void;
}) {
    const icon = TYPE_ICONS[annotation.type] ?? "bx bx-comment";

    return (
        <div className="pdf-annotation-item" onClick={() => onNavigate(annotation.pageNumber)}>
            <Icon icon={icon} style={annotation.color ? { color: annotation.color } : undefined} />
            <div className="pdf-annotation-info">
                {annotation.highlightedText && (
                    <div className="pdf-annotation-highlighted-text">{annotation.highlightedText}</div>
                )}
                {annotation.contents && (
                    <div className="pdf-annotation-contents">{annotation.contents}</div>
                )}
                {annotation.author && (
                    <div className="pdf-annotation-author">{annotation.author}</div>
                )}
            </div>
        </div>
    );
}
