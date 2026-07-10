import { NoteType } from "@triliumnext/commons";

/**
 * Note types that can be embedded as an image but are not images themselves: `api/images/<noteId>`
 * serves a generated attachment for them rather than the note's own content. Kept in sync with the
 * routes that serve those attachments (`routes/api/image.ts` and the share `routes.ts`).
 */
const NOTE_TYPE_TO_IMAGE_ATTACHMENT_TITLE: Partial<Record<NoteType, string>> = {
    canvas: "canvas-export.svg",
    mermaid: "mermaid-export.svg",
    mindMap: "mindmap-export.svg",
    spreadsheet: "spreadsheet-export.png"
};

/**
 * The title of the attachment holding the rendered image of the given note type, or `undefined`
 * if notes of that type are served as images directly.
 */
export function getImageAttachmentTitle(type: NoteType | null | undefined): string | undefined {
    return type ? NOTE_TYPE_TO_IMAGE_ATTACHMENT_TITLE[type] : undefined;
}
