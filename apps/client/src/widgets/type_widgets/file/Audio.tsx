import { useRef, useState } from "preact/hooks";

import FNote from "../../../entities/fnote";
import { getUrlForDownload } from "../../../services/open";
import { PlayPauseButton, SeekBar, VolumeControl } from "./MediaPlayer";

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
                    <div className="left" />

                    <div className="center">
                        <PlayPauseButton mediaRef={audioRef} playing={playing} />
                    </div>

                    <div className="right">
                        <VolumeControl mediaRef={audioRef} />
                    </div>
                </div>
            </div>
        </div>
    );
}
