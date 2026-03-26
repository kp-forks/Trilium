import { Request, Response } from "express";
import becca from "../../becca/becca";
import BAttachment from "../../becca/entities/battachment";
import BNote from "../../becca/entities/bnote";
import protected_session from "../../services/protected_session";
import { utils } from "../..";

const downloadFile = (req: Request<{ noteId: string }>, res: Response) => downloadNoteInt(req.params.noteId, res, true);
const openFile = (req: Request<{ noteId: string }>, res: Response) => downloadNoteInt(req.params.noteId, res, false);

const downloadAttachment = (req: Request<{ attachmentId: string }>, res: Response) => downloadAttachmentInt(req.params.attachmentId, res, true);
const openAttachment = (req: Request<{ attachmentId: string }>, res: Response) => downloadAttachmentInt(req.params.attachmentId, res, false);

function downloadNoteInt(noteId: string, res: Response, contentDisposition = true) {
    const note = becca.getNote(noteId);

    if (!note) {
        return res.setHeader("Content-Type", "text/plain").status(404).send(`Note '${noteId}' doesn't exist.`);
    }

    return downloadData(note, res, contentDisposition);
}

function downloadAttachmentInt(attachmentId: string, res: Response, contentDisposition = true) {
    const attachment = becca.getAttachment(attachmentId);

    if (!attachment) {
        return res.setHeader("Content-Type", "text/plain").status(404).send(`Attachment '${attachmentId}' doesn't exist.`);
    }

    return downloadData(attachment, res, contentDisposition);
}

function downloadData(noteOrAttachment: BNote | BAttachment, res: Response, contentDisposition: boolean) {
    if (noteOrAttachment.isProtected && !protected_session.isProtectedSessionAvailable()) {
        return res.status(401).send("Protected session not available");
    }

    if (contentDisposition) {
        const fileName = noteOrAttachment.getFileName();

        res.setHeader("Content-Disposition", utils.getContentDisposition(fileName));
    }

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Content-Type", noteOrAttachment.mime);

    res.send(noteOrAttachment.getContent());
}

export default {
    openFile,
    downloadFile,
    downloadNoteInt,
    openAttachment,
    downloadAttachment,
}
