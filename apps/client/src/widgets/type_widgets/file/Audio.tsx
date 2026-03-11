import FNote from "../../../entities/fnote";
import { getUrlForDownload } from "../../../services/open";

export default function AudioPreview({ note }: { note: FNote }) {
    return (
        <audio
            class="audio-preview"
            src={getUrlForDownload(`api/notes/${note.noteId}/open-partial`)}
            controls
        />
    );
}