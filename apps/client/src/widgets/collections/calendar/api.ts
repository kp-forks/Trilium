import { CreateChildrenResponse } from "@triliumnext/commons";

import FNote from "../../../entities/fnote";
import { setAttribute, setLabel } from "../../../services/attributes";
import server from "../../../services/server";

interface NewEventOpts {
    title: string;
    startDate: string;
    endDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    componentId?: string;
}

interface ChangeEventOpts {
    startDate: string;
    endDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
}

export async function newEvent(parentNote: FNote, { title, startDate, endDate, startTime, endTime, componentId }: NewEventOpts) {
    // Create the note.
    const { note } = await server.post<CreateChildrenResponse>(`notes/${parentNote.noteId}/children?target=into`, {
        title,
        content: "",
        type: "text"
    }, componentId);

    // Set the attributes.
    setLabel(note.noteId, "startDate", startDate, false, componentId);
    if (endDate) {
        setLabel(note.noteId, "endDate", endDate, false, componentId);
    }
    if (startTime) {
        setLabel(note.noteId, "startTime", startTime, false, componentId);
    }
    if (endTime) {
        setLabel(note.noteId, "endTime", endTime, false, componentId);
    }
}

export async function changeEvent(note: FNote, { startDate, endDate, startTime, endTime }: ChangeEventOpts) {
    // Don't store the end date if it's empty.
    if (endDate === startDate) {
        endDate = undefined;
    }

    // Since they can be customized via calendar:startDate=$foo and calendar:endDate=$bar we need to determine the
    // attributes to be effectively updated
    let startAttribute = note.getAttributes("label").filter(attr => attr.name == "calendar:startDate").shift()?.value||"startDate";
    let endAttribute = note.getAttributes("label").filter(attr => attr.name == "calendar:endDate").shift()?.value||"endDate";

    const noteId = note.noteId;
    setLabel(noteId, startAttribute, startDate);
    setAttribute(note, "label", endAttribute, endDate);

    startAttribute = note.getAttributes("label").filter(attr => attr.name == "calendar:startTime").shift()?.value||"startTime";
    endAttribute = note.getAttributes("label").filter(attr => attr.name == "calendar:endTime").shift()?.value||"endTime";

    setAttribute(note, "label", startAttribute, startTime);
    setAttribute(note, "label", endAttribute, endTime);
}
