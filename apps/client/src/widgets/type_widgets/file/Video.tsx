import "./Video.css";

import { useEffect, useRef, useState } from "preact/hooks";

import FNote from "../../../entities/fnote";
import { getUrlForDownload } from "../../../services/open";
import ActionButton from "../../react/ActionButton";

export default function VideoPreview({ note }: { note: FNote }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const togglePlayback = () => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    };

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onTimeUpdate = () => setCurrentTime(video.currentTime);
        const onDurationChange = () => setDuration(video.duration);

        video.addEventListener("timeupdate", onTimeUpdate);
        video.addEventListener("durationchange", onDurationChange);
        return () => {
            video.removeEventListener("timeupdate", onTimeUpdate);
            video.removeEventListener("durationchange", onDurationChange);
        };
    }, []);

    const onSeek = (e: Event) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = parseFloat((e.target as HTMLInputElement).value);
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
                <input
                    type="range"
                    class="video-trackbar"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={currentTime}
                    onInput={onSeek}
                />
                <ActionButton
                    icon={playing ? "bx bx-pause" : "bx bx-play"}
                    text={playing ? "Pause" : "Play"}
                    onClick={togglePlayback}
                />
            </div>
        </div>
    );
}
