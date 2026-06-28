import "./FileDropZone.css";

import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { t } from "../../services/i18n";
import { isMobile } from "../../services/utils";

export interface FileDropZoneProps {
    name?: string;
    onChange: (files: FileList | null) => void;
    multiple?: boolean;
    /** Optional `accept` attribute forwarded to the underlying file input (e.g. `".zip"`). */
    accept?: string;
    /**
     * Overrides the click-to-browse action (e.g. open a native OS dialog on desktop instead of the
     * in-page file input). Drag-and-drop still goes through `onChange`.
     */
    onBrowse?: () => void;
    /**
     * Externally-controlled selection to display in place of the internal one — e.g. native picks whose
     * filenames are known but which aren't `File` objects. When non-empty it wins; dropping files clears it.
     */
    displayNames?: string[];
}

/**
 * A styled drop region for selecting files: drag-and-drop onto it or click it to open the native file
 * picker. Selected files are listed inside. Drop-in replacement for {@link FormFileUpload} — same
 * `onChange(files)` / `multiple` contract.
 */
export default function FileDropZone({ name, onChange, multiple, accept, onBrowse, displayNames }: FileDropZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [dragging, setDragging] = useState(false);
    // Tracks dragenter/dragleave depth so moving the cursor over child elements doesn't flicker the
    // highlight (dragleave fires when crossing between nested children, not just on leaving the zone).
    const dragDepth = useRef(0);

    // Reset any stale selection carried over from a previous mount of this widget.
    useEffect(() => { onChange(null); }, []);

    // An external selection wins, so drop the internal list to keep it from lingering underneath.
    useEffect(() => {
        if (displayNames?.length) {
            setFiles([]);
        }
    }, [displayNames]);

    const update = useCallback((list: FileList | null) => {
        const selected = list && list.length ? (multiple ? Array.from(list) : [list[0]]) : [];
        setFiles(selected);
        onChange(selected.length ? list : null);
    }, [multiple, onChange]);

    const onDragEnter = useCallback((e: DragEvent) => {
        e.preventDefault();
        dragDepth.current++;
        setDragging(true);
    }, []);

    const onDragLeave = useCallback(() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) {
            setDragging(false);
        }
    }, []);

    const onDrop = useCallback((e: DragEvent) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const dropped = e.dataTransfer?.files;
        if (dropped && dropped.length) {
            update(dropped);
        }
    }, [update]);

    // An external (native) selection takes precedence over whatever the in-page input/drop produced.
    const selectedNames = displayNames?.length ? displayNames : files.map((file) => file.name);

    return (
        <label
            className={`file-drop-zone ${dragging ? "dragging" : ""} ${selectedNames.length ? "has-files" : ""}`}
            // When the caller overrides browsing (desktop native dialog), stop the label from opening the
            // in-page file input and call the override instead. Drag-and-drop is unaffected.
            onClick={onBrowse ? (e) => { e.preventDefault(); onBrowse(); } : undefined}
            onDragEnter={onDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            <input
                ref={inputRef}
                name={name}
                type="file"
                className="file-drop-zone-input"
                multiple={multiple}
                accept={accept}
                onChange={(e) => update((e.target as HTMLInputElement).files)}
            />
            {selectedNames.length ? (
                <div className="file-drop-zone-selection">
                    {selectedNames.length > 1 && <div className="file-drop-zone-count">{t("file_upload.selected", { count: selectedNames.length })}</div>}
                    <ul className="file-drop-zone-files">
                        {selectedNames.map((fileName, index) => (
                            <li key={index}><span className="bx bx-file-blank" /> <span className="file-drop-zone-filename">{fileName}</span></li>
                        ))}
                    </ul>
                </div>
            ) : (
                <div className="file-drop-zone-prompt">
                    <span className="bx bx-cloud-upload file-drop-zone-icon" />
                    <span>{isMobile()
                        ? (multiple ? t("file_upload.browse_multiple") : t("file_upload.browse_single"))
                        : (multiple ? t("file_upload.drop_or_browse_multiple") : t("file_upload.drop_or_browse_single"))}</span>
                </div>
            )}
        </label>
    );
}
