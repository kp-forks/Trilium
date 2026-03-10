import "./Video.css";

import { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import FNote from "../../../entities/fnote";
import { getUrlForDownload } from "../../../services/open";
import ActionButton from "../../react/ActionButton";

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function VideoPreview({ note }: { note: FNote }) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const togglePlayback = () => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    };

    const skip = (seconds: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    };

    const toggleFullscreen = () => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            wrapper.requestFullscreen();
        }
    };

    useEffect(() => {
        const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
    }, []);

    return (
        <div ref={wrapperRef} className="video-preview-wrapper">
            <video
                ref={videoRef}
                class="video-preview"
                src={getUrlForDownload(`api/notes/${note.noteId}/open-partial`)}
                datatype={note?.mime}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
            />

            <div className="video-preview-controls">
                <SeekBar videoRef={videoRef} />
                <div class="video-buttons-row">
                    <div className="left" />
                    <div className="center">
                        <ActionButton
                            icon="bx bx-rewind"
                            text="Back 10s"
                            onClick={() => skip(-10)}
                        />
                        <ActionButton
                            className="play-button"
                            icon={playing ? "bx bx-pause" : "bx bx-play"}
                            text={playing ? "Pause" : "Play"}
                            onClick={togglePlayback}
                        />
                        <ActionButton
                            icon="bx bx-fast-forward"
                            text="Forward 30s"
                            onClick={() => skip(30)}
                        />
                    </div>
                    <div className="right">
                        <VolumeControl videoRef={videoRef} />
                        <ActionButton
                            icon={isFullscreen ? "bx bx-exit-fullscreen" : "bx bx-fullscreen"}
                            text={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                            onClick={toggleFullscreen}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function SeekBar({ videoRef }: { videoRef: RefObject<HTMLVideoElement> }) {
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

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
        <div class="video-seekbar-row">
            <span class="video-time">{formatTime(currentTime)}</span>
            <input
                type="range"
                class="video-trackbar"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onInput={onSeek}
            />
            <span class="video-time">-{formatTime(Math.max(0, duration - currentTime))}</span>
        </div>
    );
}

function VolumeControl({ videoRef }: { videoRef: RefObject<HTMLVideoElement> }) {
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);

    const onVolumeChange = (e: Event) => {
        const video = videoRef.current;
        if (!video) return;
        const val = parseFloat((e.target as HTMLInputElement).value);
        video.volume = val;
        setVolume(val);
        if (val > 0 && video.muted) {
            video.muted = false;
            setMuted(false);
        }
    };

    const toggleMute = () => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = !video.muted;
        setMuted(video.muted);
    };

    return (
        <div class="video-volume-row">
            <ActionButton
                icon={muted || volume === 0 ? "bx bx-volume-mute" : volume < 0.5 ? "bx bx-volume-low" : "bx bx-volume-full"}
                text={muted ? "Unmute" : "Mute"}
                onClick={toggleMute}
            />
            <input
                type="range"
                class="video-volume-slider"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onInput={onVolumeChange}
            />
        </div>
    );
}
