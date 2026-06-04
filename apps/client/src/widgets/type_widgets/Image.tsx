import "./Image.css";

import { useEffect, useRef, useState } from "preact/hooks";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

import image_context_menu from "../../menus/image_context_menu";
import { copyImageReferenceToClipboard } from "../../services/image";
import { createImageSrcUrl } from "../../services/utils";
import { useTriliumEvent, useTriliumEvents } from "../react/hooks";
import ImageViewer from "../react/ImageViewer";
import { refToJQuerySelector } from "../react/react_utils";
import { TypeWidgetProps } from "./type_widget";

const ZOOM_STEP = 0.5;

export default function Image({ note, ntxId }: TypeWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const copyRef = useRef<HTMLDivElement>(null);
    const zoomRef = useRef<ReactZoomPanPinchRef>(null);
    const [ refreshCounter, setRefreshCounter ] = useState(0);

    useEffect(() => image_context_menu.setupContextMenu(refToJQuerySelector(containerRef)), []);

    // The ribbon's "copy reference" button triggers this. Copy a plain <img> rather than the
    // zoom wrapper so the clipboard gets clean markup without the transform containers.
    useTriliumEvent("copyImageReferenceToClipboard", ({ ntxId: eventNtxId }) => {
        if (eventNtxId !== ntxId || !copyRef.current) return;
        const img = document.createElement("img");
        img.src = createImageSrcUrl(note);
        copyRef.current.replaceChildren(img);
        copyImageReferenceToClipboard(refToJQuerySelector(copyRef));
        copyRef.current.replaceChildren();
    });

    useTriliumEvents([ "imageZoomIn", "imageZoomOut", "imageZoomReset" ], ({ ntxId: eventNtxId }, eventName) => {
        const zoom = zoomRef.current;
        if (eventNtxId !== ntxId || !zoom) return;
        if (eventName === "imageZoomIn") zoom.zoomIn(ZOOM_STEP);
        else if (eventName === "imageZoomOut") zoom.zoomOut(ZOOM_STEP);
        else zoom.resetTransform();
    });

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
            />
            <div ref={copyRef} className="image-copy-reference-source" />
        </div>
    );
}
