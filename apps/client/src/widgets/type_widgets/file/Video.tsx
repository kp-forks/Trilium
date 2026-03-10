import "./Video.css";

import { useRef } from "preact/hooks";

import FNote from "../../../entities/fnote";
import { getUrlForDownload } from "../../../services/open";
import ActionButton from "../../react/ActionButton";

export default function VideoPreview({ note }: { note: FNote }) {
    const videoRef = useRef<HTMLVideoElement>(null);

    return (
        <div className="video-preview-wrapper">
            <video
                ref={videoRef}
                class="video-preview"
                src={getUrlForDownload(`api/notes/${note.noteId}/open-partial`)}
                datatype={note?.mime}
            />

            <div className="video-preview-controls">
                <ActionButton icon="bx bx-play" text="Play" onClick={() => videoRef.current?.play()} />
                <ActionButton icon="bx bx-pause" text="Pause" onClick={() => videoRef.current?.pause()} />
            </div>
        </div>
    );
}
