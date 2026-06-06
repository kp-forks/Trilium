import "./MediaPlayer.css";

import { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import appContext from "../../../components/app_context";
import type NoteContext from "../../../components/note_context";
import type FNote from "../../../entities/fnote";
import { t } from "../../../services/i18n";
import ActionButton from "../../react/ActionButton";
import Dropdown from "../../react/Dropdown";
import { useTriliumEvents } from "../../react/hooks";
import Icon from "../../react/Icon";
import { noteSiblingProvider, type SiblingNavigationState, useSiblingKeyboard, useSiblingNavigation } from "../../react/SiblingNavigator";

const NO_KEYS: readonly string[] = [];

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
    }, [ mediaRef ]);

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

export function PlayPauseButton({ playing, togglePlayback }: {    
    playing: boolean,
    togglePlayback: () => void
}) {
    return (
        <ActionButton
            className="play-button"
            icon={playing ? "bx bx-pause" : "bx bx-play"}
            text={playing ? t("media.pause") : t("media.play")}
            onClick={togglePlayback}
        />
    );
}

export function VolumeControl({ mediaRef }: { mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement> }) {
    const [volume, setVolume] = useState(() => mediaRef.current?.volume ?? 1);
    const [muted, setMuted] = useState(() => mediaRef.current?.muted ?? false);

    // Sync state when the media element changes volume externally.
    useEffect(() => {
        const media = mediaRef.current;
        if (!media) return;

        setVolume(media.volume);
        setMuted(media.muted);

        const onVolumeChange = () => {
            setVolume(media.volume);
            setMuted(media.muted);
        };
        media.addEventListener("volumechange", onVolumeChange);
        return () => media.removeEventListener("volumechange", onVolumeChange);
    }, [ mediaRef ]);

    const onVolumeChange = (e: Event) => {
        const media = mediaRef.current;
        if (!media) return;
        const val = parseFloat((e.target as HTMLInputElement).value);
        media.volume = val;
        setVolume(val);
        if (val > 0 && media.muted) {
            media.muted = false;
            setMuted(false);
        }
    };

    const toggleMute = () => {
        const media = mediaRef.current;
        if (!media) return;
        media.muted = !media.muted;
        setMuted(media.muted);
    };

    return (
        <div class="media-volume-row">
            <ActionButton
                icon={muted || volume === 0 ? "bx bx-volume-mute" : volume < 0.5 ? "bx bx-volume-low" : "bx bx-volume-full"}
                text={muted ? t("media.unmute") : t("media.mute")}
                onClick={toggleMute}
            />
            <input
                type="range"
                class="media-volume-slider"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onInput={onVolumeChange}
            />
        </div>
    );
}

/** Set when jumping to a sibling, so the media opened next auto-plays — like a playlist. */
let autoPlayNextMedia = false;

/** noteId of the player currently owning the (global) Media Session action handlers, if any. */
let mediaSessionOwner: string | null = null;

/**
 * Sibling navigation across the note's same-mime media siblings (e.g. all `video/` files in the parent),
 * with PageUp/PageDown wired to previous/next (Home/End and Space are left to the player). Jumping to a
 * sibling auto-plays it once loaded, like a playlist.
 */
export function useMediaSiblingNavigation(note: FNote, noteContext: NoteContext | undefined, mimePrefix: string, mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement>) {
    const navigation = useSiblingNavigation(noteSiblingProvider(note, noteContext, { mimePrefix }));

    // The previous note's player can linger mounted (cached) in the background while its context still
    // reports active, so gate everything — keyboard, media keys and buttons — on this note being the one
    // actually shown in the active tab. Computed each render so it tracks navigation immediately; the
    // events only force a re-render for cached players, which otherwise wouldn't re-evaluate.
    const [ , bumpOnNoteSwitch ] = useState(0);
    useTriliumEvents([ "activeContextChanged", "activeNoteChanged" ], () => bumpOnNoteSwitch((tick) => tick + 1));
    const isShown = isShownNote(noteContext, note.noteId);

    const wrapped = navigation && isShown ? {
        ...navigation,
        navigatePrevious: () => { autoPlayNextMedia = true; navigation.navigatePrevious(); },
        navigateNext: () => { autoPlayNextMedia = true; navigation.navigateNext(); }
    } : null;

    useSiblingKeyboard(wrapped, noteContext, undefined, NO_KEYS, NO_KEYS, { edgeKeys: false });

    // Bind the OS media controls / hardware media keys (previous/next track) to navigation — desktop
    // routes these to the (global) Media Session rather than to keydown. Gated on `wrapped`, with a
    // live re-check inside the handler to cover the window before a backgrounded player re-renders.
    const hasMediaNav = !!wrapped;
    const wrappedRef = useRef(wrapped);
    wrappedRef.current = wrapped;
    useEffect(() => {
        if (!("mediaSession" in navigator)) return;
        const mediaSession = navigator.mediaSession;
        const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
            try { mediaSession.setActionHandler(action, handler); } catch { /* action unsupported */ }
        };
        // The handlers are global, so only ever release our own — otherwise the outgoing player's cleanup
        // (when switching media → media) would clobber the handlers the incoming player just registered.
        const release = () => {
            if (mediaSessionOwner !== note.noteId) return;
            mediaSessionOwner = null;
            setHandler("previoustrack", null);
            setHandler("nexttrack", null);
        };
        if (!hasMediaNav) {
            release();
            return;
        }
        mediaSessionOwner = note.noteId;
        setHandler("previoustrack", () => { if (isShownNote(noteContext, note.noteId)) wrappedRef.current?.navigatePrevious(); });
        setHandler("nexttrack", () => { if (isShownNote(noteContext, note.noteId)) wrappedRef.current?.navigateNext(); });
        return release;
    }, [ hasMediaNav, noteContext, note.noteId ]);

    // Give the session metadata while shown: Chromium otherwise often won't present the OS media controls
    // for video (it does for audio), and this also shows the note title in those controls.
    useEffect(() => {
        if (!("mediaSession" in navigator) || !isShown) return;
        navigator.mediaSession.metadata = new MediaMetadata({ title: note.title });
    }, [ isShown, note.noteId, note.title ]);

    // Auto-play the freshly-opened sibling once it can play (only when reached via navigation).
    useEffect(() => {
        if (!autoPlayNextMedia) return;
        autoPlayNextMedia = false;
        const media = mediaRef.current;
        if (!media) return;
        const play = () => { media.play().catch(() => {}); };
        if (media.readyState >= media.HAVE_FUTURE_DATA) {
            play();
        } else {
            media.addEventListener("canplay", play, { once: true });
            return () => media.removeEventListener("canplay", play);
        }
    }, [ note.noteId, mediaRef ]);

    return wrapped;
}

/** Whether `noteId` is the note actually shown in the active tab (so a cached background player stands down). */
function isShownNote(noteContext: NoteContext | undefined, noteId: string): boolean {
    return !!noteContext && noteContext.isActive() && appContext.tabManager.getActiveContextNoteId() === noteId;
}

/** "Skip to previous/next sibling" control, styled like the other media buttons; renders nothing without siblings. */
export function MediaSiblingButton({ navigation, direction, tooltipI18nKey }: { navigation: SiblingNavigationState | null, direction: "previous" | "next", tooltipI18nKey: string }) {
    if (!navigation) return null;
    const isPrevious = direction === "previous";
    return (
        <ActionButton
            icon={isPrevious ? "bx bx-skip-previous" : "bx bx-skip-next"}
            text={t(tooltipI18nKey, { title: isPrevious ? navigation.previousTitle : navigation.nextTitle })}
            onClick={() => (isPrevious ? navigation.navigatePrevious() : navigation.navigateNext())}
        />
    );
}

export function SkipButton({ mediaRef, seconds, icon, text }: { mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement>, seconds: number, icon: string, text: string }) {
    const skip = () => {
        const media = mediaRef.current;
        if (!media) return;
        media.currentTime = Math.max(0, Math.min(media.duration, media.currentTime + seconds));
    };

    return (
        <ActionButton icon={icon} text={text} onClick={skip} />
    );
}

export function LoopButton({ mediaRef }: { mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement> }) {
    const [loop, setLoop] = useState(() => mediaRef.current?.loop ?? false);

    useEffect(() => {
        const media = mediaRef.current;
        if (!media) return;
        setLoop(media.loop);

        const observer = new MutationObserver(() => setLoop(media.loop));
        observer.observe(media, { attributes: true, attributeFilter: ["loop"] });
        return () => observer.disconnect();
    }, [ mediaRef ]);

    const toggle = () => {
        const media = mediaRef.current;
        if (!media) return;
        media.loop = !media.loop;
        setLoop(media.loop);
    };

    return (
        <ActionButton
            className={loop ? "active" : ""}
            icon="bx bx-repeat"
            text={loop ? t("media.disable-loop") : t("media.loop")}
            onClick={toggle}
        />
    );
}

const PLAYBACK_SPEEDS = [0.5, 1, 1.25, 1.5, 2];

export function PlaybackSpeed({ mediaRef }: { mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement> }) {
    const [speed, setSpeed] = useState(() => mediaRef.current?.playbackRate ?? 1);

    useEffect(() => {
        const media = mediaRef.current;
        if (!media) return;

        setSpeed(media.playbackRate);

        const onRateChange = () => setSpeed(media.playbackRate);
        media.addEventListener("ratechange", onRateChange);
        return () => media.removeEventListener("ratechange", onRateChange);
    }, [ mediaRef ]);

    const selectSpeed = (rate: number) => {
        const media = mediaRef.current;
        if (!media) return;
        media.playbackRate = rate;
        setSpeed(rate);
    };

    return (
        <Dropdown
            iconAction
            hideToggleArrow
            buttonClassName="speed-dropdown"
            text={<>
                <Icon icon="bx bx-tachometer" />
                <span class="media-speed-label">{speed}x</span>
            </>}
            title={t("media.playback-speed")}
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
