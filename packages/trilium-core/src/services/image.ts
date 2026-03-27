export default {
    saveImageToAttachment(noteId: string, imageBuffer: Uint8Array, title: string, b1: boolean, b2: boolean) {
        console.warn("Image save ignored", noteId, title);

        return {
            attachmentId: null,
            title: ""
        };
    },

    updateImage(noteId: string, imageBuffer: Uint8Array, title: string) {
        console.warn("Image update ignored", noteId, title);
    }
}
