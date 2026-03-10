import "./Video.css";

import { RefObject } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import FNote from "../../../entities/fnote";
import { getUrlForDownload } from "../../../services/open";
import ActionButton from "../../react/ActionButton";
import Dropdown from "../../react/Dropdown";
import Icon from "../../react/Icon";

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const AUTO_HIDE_DELAY = 3000;

export default function VideoPreview({ note }: { note: FNote }) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);
    const { visible: controlsVisible, onMouseMove, onClick: onWrapperClick } = useAutoHideControls(videoRef, playing);

    return (
        <div ref={wrapperRef} className={`video-preview-wrapper ${controlsVisible ? "" : "controls-hidden"}`} onClick={onWrapperClick} onMouseMove={onMouseMove}>
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
                    <div className="left">
                        <PlaybackSpeed videoRef={videoRef} />
                    </div>
                    <div className="center">
                        <SkipButton videoRef={videoRef} seconds={-10} icon="bx bx-rewind" text="Back 10s" />
                        <PlayPauseButton videoRef={videoRef} playing={playing} />
                        <SkipButton videoRef={videoRef} seconds={30} icon="bx bx-fast-forward" text="Forward 30s" />
                    </div>
                    <div className="right">
                        <VolumeControl videoRef={videoRef} />
                        <FullscreenButton targetRef={wrapperRef} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function useAutoHideControls(videoRef: RefObject<HTMLVideoElement>, playing: boolean) {
    const [visible, setVisible] = useState(true);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

    const scheduleHide = useCallback(() => {
        clearTimeout(hideTimerRef.current);
        if (videoRef.current && !videoRef.current.paused) {
            hideTimerRef.current = setTimeout(() => setVisible(false), AUTO_HIDE_DELAY);
        }
    }, []);

    const onMouseMove = useCallback(() => {
        setVisible(true);
        scheduleHide();
    }, [scheduleHide]);

    const onClick = useCallback((e: MouseEvent) => {
        if (!playing) return;
        if ((e.target as HTMLElement).closest(".video-preview-controls")) return;
        setVisible((prev) => {
            const next = !prev;
            clearTimeout(hideTimerRef.current);
            if (next) scheduleHide();
            return next;
        });
    }, [playing, scheduleHide]);

    // Hide immediately when playback starts, show when paused.
    useEffect(() => {
        if (playing) {
            setVisible(false);
        } else {
            clearTimeout(hideTimerRef.current);
            setVisible(true);
        }
        return () => clearTimeout(hideTimerRef.current);
    }, [playing, scheduleHide]);

    return { visible, onMouseMove, onClick };
}

function PlayPauseButton({ videoRef, playing }: { videoRef: RefObject<HTMLVideoElement>, playing: boolean }) {
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
        <ActionButton
            className="play-button"
            icon={playing ? "bx bx-pause" : "bx bx-play"}
            text={playing ? "Pause" : "Play"}
            onClick={togglePlayback}
        />
    );
}

function SkipButton({ videoRef, seconds, icon, text }: { videoRef: RefObject<HTMLVideoElement>, seconds: number, icon: string, text: string }) {
    const skip = () => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    };

    return (
        <ActionButton icon={icon} text={text} onClick={skip} />
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

const PLAYBACK_SPEEDS = [0.5, 1, 1.25, 1.5, 2];

function PlaybackSpeed({ videoRef }: { videoRef: RefObject<HTMLVideoElement> }) {
    const [speed, setSpeed] = useState(1);

    const selectSpeed = (rate: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.playbackRate = rate;
        setSpeed(rate);
    };

    return (
        <Dropdown
            iconAction
            hideToggleArrow
            buttonClassName="speed-dropdown"
            text={<>
                <Icon icon="bx bx-tachometer" />
                <span class="video-speed-label">{speed}x</span>
            </>}
            title="Playback speed"
        >
            {PLAYBACK_SPEEDS.map((rate) => (
                <li key={rate}>
                    <button
                        class={`dropdown-item ${rate === speed ? "active" : ""}`}
                        onClick={() => selectSpeed(rate)}
                    >
                        {rate}x
                    </button>
                </li>
            ))}
        </Dropdown>
    );
}

function FullscreenButton({ targetRef }: { targetRef: RefObject<HTMLElement> }) {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        const target = targetRef.current;
        if (!target) return;

        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            target.requestFullscreen();
        }
    };

    return (
        <ActionButton
            icon={isFullscreen ? "bx bx-exit-fullscreen" : "bx bx-fullscreen"}
            text={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
        />
    );
}
