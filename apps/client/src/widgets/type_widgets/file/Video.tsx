import "./Video.css";

import FNote from "../../../entities/fnote";
import { getUrlForDownload } from "../../../services/open";

export default function VideoPreview({ note }: { note: FNote }) {
    return (
        <video
            class="video-preview"
            src={getUrlForDownload(`api/notes/${note.noteId}/open-partial`)}
            datatype={note?.mime}
            controls
        />
    );
}
