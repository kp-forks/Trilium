import { useNoteContext } from "../react/hooks";
import { NoteContextMenu } from "../ribbon/NoteActions";

export default function MobileDetailMenu() {
    const { note, noteContext } = useNoteContext();

    return (
        <div style={{ contain: "none" }}>
            {note && <NoteContextMenu note={note} noteContext={noteContext} />}
        </div>
    );
}
