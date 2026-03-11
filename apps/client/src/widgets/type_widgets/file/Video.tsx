import "./Video.css";

import { RefObject } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import FNote from "../../../entities/fnote";
import { t } from "../../../services/i18n";
import { getUrlForDownload } from "../../../services/open";
import ActionButton from "../../react/ActionButton";
import Dropdown from "../../react/Dropdown";
import Icon from "../../react/Icon";
import NoItems from "../../react/NoItems";

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
    const [error, setError] = useState(false);
    const { visible: controlsVisible, onMouseMove, flash: flashControls } = useAutoHideControls(videoRef, playing);

    useEffect(() => setError(false), [note.noteId]);
    const onError = useCallback(() => setError(true), []);

    const togglePlayback = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    }, []);

    const onVideoClick = useCallback((e: MouseEvent) => {
        if ((e.target as HTMLElement).closest(".video-preview-controls")) return;
        togglePlayback();
    }, [togglePlayback]);

    const onKeyDown = useCallback((e: KeyboardEvent) => {
        const video = videoRef.current;
        if (!video) return;

        switch (e.key) {
            case " ":
                e.preventDefault();
                togglePlayback();
                flashControls();
                break;
            case "ArrowLeft":
                e.preventDefault();
                video.currentTime = Math.max(0, video.currentTime - (e.ctrlKey ? 60 : 10));
                flashControls();
                break;
            case "ArrowRight":
                e.preventDefault();
                video.currentTime = Math.min(video.duration, video.currentTime + (e.ctrlKey ? 60 : 10));
                flashControls();
                break;
            case "f":
            case "F":
                e.preventDefault();
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                } else {
                    wrapperRef.current?.requestFullscreen();
                }
                break;
            case "m":
            case "M":
                e.preventDefault();
                video.muted = !video.muted;
                flashControls();
                break;
            case "ArrowUp":
                e.preventDefault();
                video.volume = Math.min(1, video.volume + 0.05);
                flashControls();
                break;
            case "ArrowDown":
                e.preventDefault();
                video.volume = Math.max(0, video.volume - 0.05);
                flashControls();
                break;
            case "Home":
                e.preventDefault();
                video.currentTime = 0;
                flashControls();
                break;
            case "End":
                e.preventDefault();
                video.currentTime = video.duration;
                flashControls();
                break;
        }
    }, [togglePlayback, flashControls]);

    if (error) {
        return <NoItems icon="bx bx-video-off" text={t("video.unsupported-format")} />;
    }

    return (
        <div ref={wrapperRef} className={`video-preview-wrapper ${controlsVisible ? "" : "controls-hidden"}`} tabIndex={0} onClick={onVideoClick} onKeyDown={onKeyDown} onMouseMove={onMouseMove}>
            <video
                ref={videoRef}
                class="video-preview"
                src={getUrlForDownload(`api/notes/${note.noteId}/open-partial`)}
                datatype={note?.mime}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={onError}
            />

            <div className="video-preview-controls">
                <SeekBar videoRef={videoRef} />
                <div class="video-buttons-row">
                    <div className="left">
                        <PlaybackSpeed videoRef={videoRef} />
                        <RotateButton videoRef={videoRef} />
                    </div>
                    <div className="center">
                        <div className="spacer" />
                        <SkipButton videoRef={videoRef} seconds={-10} icon="bx bx-rewind" text={t("video.back-10s")} />
                        <PlayPauseButton videoRef={videoRef} playing={playing} />
                        <SkipButton videoRef={videoRef} seconds={30} icon="bx bx-fast-forward" text={t("video.forward-30s")} />
                        <LoopButton videoRef={videoRef} />
                    </div>
                    <div className="right">
                        <VolumeControl videoRef={videoRef} />
                        <ZoomToFitButton videoRef={videoRef} />
                        <PictureInPictureButton videoRef={videoRef} />
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

    return { visible, onMouseMove, flash: onMouseMove };
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
            text={playing ? t("video.pause") : t("video.play")}
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
    const [volume, setVolume] = useState(() => videoRef.current?.volume ?? 1);
    const [muted, setMuted] = useState(() => videoRef.current?.muted ?? false);

    // Sync state when the video element changes volume externally.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        setVolume(video.volume);
        setMuted(video.muted);

        const onVolumeChange = () => {
            setVolume(video.volume);
            setMuted(video.muted);
        };
        video.addEventListener("volumechange", onVolumeChange);
        return () => video.removeEventListener("volumechange", onVolumeChange);
    }, []);

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
                text={muted ? t("video.unmute") : t("video.mute")}
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
    const [speed, setSpeed] = useState(() => videoRef.current?.playbackRate ?? 1);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        setSpeed(video.playbackRate);

        const onRateChange = () => setSpeed(video.playbackRate);
        video.addEventListener("ratechange", onRateChange);
        return () => video.removeEventListener("ratechange", onRateChange);
    }, []);

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
            title={t("video.playback-speed")}
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

function LoopButton({ videoRef }: { videoRef: RefObject<HTMLVideoElement> }) {
    const [loop, setLoop] = useState(() => videoRef.current?.loop ?? false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        setLoop(video.loop);

        const observer = new MutationObserver(() => setLoop(video.loop));
        observer.observe(video, { attributes: true, attributeFilter: ["loop"] });
        return () => observer.disconnect();
    }, []);

    const toggle = () => {
        const video = videoRef.current;
        if (!video) return;
        video.loop = !video.loop;
        setLoop(video.loop);
    };

    return (
        <ActionButton
            className={loop ? "active" : ""}
            icon="bx bx-repeat"
            text={loop ? t("video.disable-loop") : t("video.loop")}
            onClick={toggle}
        />
    );
}

function RotateButton({ videoRef }: { videoRef: RefObject<HTMLVideoElement> }) {
    const [rotation, setRotation] = useState(0);

    const rotate = () => {
        const video = videoRef.current;
        if (!video) return;
        const next = (rotation + 90) % 360;
        setRotation(next);

        const isSideways = next === 90 || next === 270;
        if (isSideways) {
            // Scale down so the rotated video fits within its container.
            const container = video.parentElement;
            if (container) {
                const ratio = container.clientWidth / container.clientHeight;
                video.style.transform = `rotate(${next}deg) scale(${1 / ratio})`;
            } else {
                video.style.transform = `rotate(${next}deg)`;
            }
        } else {
            video.style.transform = next === 0 ? "" : `rotate(${next}deg)`;
        }
    };

    return (
        <ActionButton
            icon="bx bx-rotate-right"
            text={t("video.rotate")}
            onClick={rotate}
        />
    );
}

function ZoomToFitButton({ videoRef }: { videoRef: RefObject<HTMLVideoElement> }) {
    const [fitted, setFitted] = useState(false);

    const toggle = () => {
        const video = videoRef.current;
        if (!video) return;
        const next = !fitted;
        video.style.objectFit = next ? "cover" : "";
        setFitted(next);
    };

    return (
        <ActionButton
            className={fitted ? "active" : ""}
            icon={fitted ? "bx bx-collapse" : "bx bx-expand"}
            text={fitted ? t("video.zoom-reset") : t("video.zoom-to-fit")}
            onClick={toggle}
        />
    );
}

function PictureInPictureButton({ videoRef }: { videoRef: RefObject<HTMLVideoElement> }) {
    const [active, setActive] = useState(false);
    // The standard PiP API is only supported in Chromium-based browsers.
    // Firefox uses its own proprietary PiP implementation.
    const supported = "requestPictureInPicture" in HTMLVideoElement.prototype;

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !supported) return;

        const onEnter = () => setActive(true);
        const onLeave = () => setActive(false);

        video.addEventListener("enterpictureinpicture", onEnter);
        video.addEventListener("leavepictureinpicture", onLeave);
        return () => {
            video.removeEventListener("enterpictureinpicture", onEnter);
            video.removeEventListener("leavepictureinpicture", onLeave);
        };
    }, [supported]);

    if (!supported) return null;

    const toggle = () => {
        const video = videoRef.current;
        if (!video) return;

        if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
        } else {
            video.requestPictureInPicture();
        }
    };

    return (
        <ActionButton
            icon={active ? "bx bx-exit" : "bx bx-window-open"}
            text={active ? t("video.exit-picture-in-picture") : t("video.picture-in-picture")}
            onClick={toggle}
        />
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
            text={isFullscreen ? t("video.exit-fullscreen") : t("video.fullscreen")}
            onClick={toggleFullscreen}
        />
    );
}
