import { useRef, useState } from "preact/hooks";

import FNote from "../../../entities/fnote";
import { t } from "../../../services/i18n";
import { getUrlForDownload } from "../../../services/open";
import { LoopButton, PlaybackSpeed, PlayPauseButton, SeekBar, SkipButton, VolumeControl } from "./MediaPlayer";

export default function AudioPreview({ note }: { note: FNote }) {
    const [playing, setPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    return (
        <div className="audio-preview-wrapper">
            <audio
                class="audio-preview"
                src={getUrlForDownload(`api/notes/${note.noteId}/open-partial`)}
                ref={audioRef}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
            />
            <div className="media-preview-controls">
                <SeekBar mediaRef={audioRef} />

                <div class="media-buttons-row">
                    <div className="left">
                        <PlaybackSpeed mediaRef={audioRef} />
                    </div>

                    <div className="center">
                        <div className="spacer" />
                        <SkipButton mediaRef={audioRef} seconds={-10} icon="bx bx-rewind" text={t("video.back-10s")} />
                        <PlayPauseButton mediaRef={audioRef} playing={playing} />
                        <SkipButton mediaRef={audioRef} seconds={30} icon="bx bx-fast-forward" text={t("video.forward-30s")} />
                        <LoopButton mediaRef={audioRef} />
                    </div>

                    <div className="right">
                        <VolumeControl mediaRef={audioRef} />
                    </div>
                </div>
            </div>
        </div>
    );
}
