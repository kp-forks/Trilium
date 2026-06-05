import "./Image.css";

import { useEffect, useRef, useState } from "preact/hooks";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

import image_context_menu from "../../menus/image_context_menu";
import { copyImageReferenceToClipboard } from "../../services/image";
import { createImageSrcUrl } from "../../services/utils";
import { useTriliumEvent, useTriliumEvents } from "../react/hooks";
import ImageViewer from "../react/ImageViewer";
import { refToJQuerySelector } from "../react/react_utils";
import { applyImageZoom } from "./image_zoom";
import { TypeWidgetProps } from "./type_widget";

export default function Image({ note, ntxId }: TypeWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const zoomRef = useRef<ReactZoomPanPinchRef>(null);
    const [ refreshCounter, setRefreshCounter ] = useState(0);

    useEffect(() => image_context_menu.setupContextMenu(refToJQuerySelector(containerRef)), []);

    // The ribbon's "copy reference" button triggers this. Select the rendered image's wrapper so
    // the clipboard gets clean <img> markup without the surrounding zoom/transform containers.
    useTriliumEvent("copyImageReferenceToClipboard", ({ ntxId: eventNtxId }) => {
        if (eventNtxId !== ntxId) return;
        copyImageReferenceToClipboard(refToJQuerySelector(containerRef).find("img").parent());
    });

    useTriliumEvents([ "imageZoomIn", "imageZoomOut", "imageZoomReset" ], ({ ntxId: eventNtxId }, eventName) =>
        applyImageZoom(zoomRef.current, eventName, eventNtxId, ntxId)
    );

    // A new revision swaps the image content; remount so it re-fits to the viewport.
    useTriliumEvent("entitiesReloaded", ({ loadResults }) => {
        if (loadResults.isNoteReloaded(note.noteId)) {
            setRefreshCounter((c) => c + 1);
        }
    });

    return (
        <div ref={containerRef} className="note-detail-image-wrapper">
            <ImageViewer
                key={`${note.noteId}-${refreshCounter}`}
                apiRef={zoomRef}
                imgClassName="note-detail-image-view"
                src={createImageSrcUrl(note)}
                alt={note.title}
            />
        </div>
    );
}
