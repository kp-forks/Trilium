import "./MediaPlayer.css";

import { RefObject } from "preact";
import { useEffect, useState } from "preact/hooks";

import { t } from "../../../services/i18n";
import ActionButton from "../../react/ActionButton";

export function SeekBar({ mediaRef }: { mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement> }) {
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        const media = mediaRef.current;
        if (!media) return;

        const onTimeUpdate = () => setCurrentTime(media.currentTime);
        const onDurationChange = () => setDuration(media.duration);

        media.addEventListener("timeupdate", onTimeUpdate);
        media.addEventListener("durationchange", onDurationChange);
        return () => {
            media.removeEventListener("timeupdate", onTimeUpdate);
            media.removeEventListener("durationchange", onDurationChange);
        };
    }, []);

    const onSeek = (e: Event) => {
        const media = mediaRef.current;
        if (!media) return;
        media.currentTime = parseFloat((e.target as HTMLInputElement).value);
    };

    return (
        <div class="media-seekbar-row">
            <span class="media-time">{formatTime(currentTime)}</span>
            <input
                type="range"
                class="media-trackbar"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onInput={onSeek}
            />
            <span class="media-time">-{formatTime(Math.max(0, duration - currentTime))}</span>
        </div>
    );
}

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PlayPauseButton({ mediaRef, playing }: { mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement>, playing: boolean }) {
    const togglePlayback = () => {
        const media = mediaRef.current;
        if (!media) return;

        if (media.paused) {
            media.play();
        } else {
            media.pause();
        }
    };

    return (
        <ActionButton
            className="play-button"
            icon={playing ? "bx bx-pause" : "bx bx-play"}
            text={playing ? t("video.pause") : t("video.play")}
            onClick={togglePlayback}
        />
    );
}
