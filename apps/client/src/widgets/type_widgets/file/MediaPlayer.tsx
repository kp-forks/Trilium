import { RefObject } from "preact";

import { t } from "../../../services/i18n";
import ActionButton from "../../react/ActionButton";

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