import "./Video.css";

import { useRef, useState } from "preact/hooks";

import FNote from "../../../entities/fnote";
import { getUrlForDownload } from "../../../services/open";
import ActionButton from "../../react/ActionButton";

export default function VideoPreview({ note }: { note: FNote }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);

    const togglePlayback = () => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    };

    return (
        <div className="video-preview-wrapper">
            <video
                ref={videoRef}
                class="video-preview"
                src={getUrlForDownload(`api/notes/${note.noteId}/open-partial`)}
                datatype={note?.mime}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
            />

            <div className="video-preview-controls">
                <ActionButton
                    icon={playing ? "bx bx-pause" : "bx bx-play"}
                    text={playing ? "Pause" : "Play"}
                    onClick={togglePlayback}
                />
            </div>
        </div>
    );
}
