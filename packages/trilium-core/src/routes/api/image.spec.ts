import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import becca from "../../becca/becca.js";
import imageService from "../../services/image.js";
import { note } from "../../test/becca_mocking.js";
import { createTextNote } from "../../test/api_fixtures.js";
import { CoreApiTester } from "../../test/api_tester.js";
import { renderSvgAttachment } from "./image.js";

let api: CoreApiTester;

/** Builds a fake image-like entity (note or revision) for the becca stubs. */
function fakeImage(overrides: Record<string, unknown>) {
    return {
        type: "image",
        mime: "image/png",
        getContent: () => Buffer.from([1, 2, 3]),
        getAttachmentByTitle: () => null,
        getJsonContentSafely: () => null,
        ...overrides
    };
}

describe("Image API", () => {
    beforeAll(() => {
        api = CoreApiTester.build();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("renders empty SVG properly", () => {
        const parentNote = note("note").note;
        const response = new MockResponse();
        renderSvgAttachment(parentNote, response as any, "attachment");
        expect(response.headers["Content-Type"]).toBe("image/svg+xml");
        expect(response.body).toBe(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`);
    });

    describe("renderSvgAttachment", () => {
        it("renders the SVG stored in an attachment", () => {
            const response = new MockResponse();
            const img = fakeImage({
                getAttachmentByTitle: () => ({ getContent: () => "<svg><rect/></svg>" })
            });
            renderSvgAttachment(img as any, response as any, "canvas-export.svg");
            expect(response.headers["Content-Type"]).toBe("image/svg+xml");
            expect(response.body).toContain("<svg");
        });

        it("falls back to the legacy svg key in the note content", () => {
            const response = new MockResponse();
            const img = fakeImage({
                getJsonContentSafely: () => ({ svg: "<svg id='legacy'></svg>" })
            });
            renderSvgAttachment(img as any, response as any, "mermaid-export.svg");
            expect(response.body).toContain("legacy");
        });
    });

    describe("returnImageFromNote (GET /api/images/:noteId/:filename)", () => {
        it("404s when the note does not exist", async () => {
            vi.spyOn(becca, "getNote").mockReturnValue(null);
            const res = await api.get("/api/images/missing/file.png");
            expect(res.status).toBe(404);
        });

        it("400s when the note is not an image type", async () => {
            vi.spyOn(becca, "getNote").mockReturnValue(fakeImage({ type: "text" }) as any);
            const res = await api.get("/api/images/someNote/file.png");
            expect(res.status).toBe(400);
        });

        it("serves a regular raster image", async () => {
            vi.spyOn(becca, "getNote").mockReturnValue(
                fakeImage({ type: "image", mime: "image/png" }) as any
            );
            const res = await api.get("/api/images/someNote/file.png");
            expect(res.status).toBe(200);
            expect(res.headers["Content-Type"]).toBe("image/png");
            expect(res.headers["Cache-Control"]).toContain("no-cache");
        });

        it("sanitizes an SVG image note", async () => {
            vi.spyOn(becca, "getNote").mockReturnValue(
                fakeImage({
                    type: "image",
                    mime: "image/svg+xml",
                    getContent: () => "<svg><script>alert(1)</script></svg>"
                }) as any
            );
            const res = await api.get<string>("/api/images/someNote/file.svg");
            expect(res.status).toBe(200);
            expect(res.headers["Content-Type"]).toBe("image/svg+xml");
            expect(res.headers["Content-Security-Policy"]).toBe("script-src 'none'");
            expect(res.body).not.toContain("alert(1)");
        });

        it("renders a canvas note as an SVG attachment", async () => {
            vi.spyOn(becca, "getNote").mockReturnValue(
                fakeImage({
                    type: "canvas",
                    getAttachmentByTitle: () => ({ getContent: () => "<svg id='canvas'></svg>" })
                }) as any
            );
            const res = await api.get<string>("/api/images/someNote/file.svg");
            expect(res.status).toBe(200);
            expect(res.headers["Content-Type"]).toBe("image/svg+xml");
            expect(res.body).toContain("canvas");
        });

        it("renders a mermaid note as an SVG attachment", async () => {
            vi.spyOn(becca, "getNote").mockReturnValue(fakeImage({ type: "mermaid" }) as any);
            const res = await api.get<string>("/api/images/someNote/file.svg");
            expect(res.status).toBe(200);
            expect(res.headers["Content-Type"]).toBe("image/svg+xml");
        });

        it("renders a mindMap note as an SVG attachment", async () => {
            vi.spyOn(becca, "getNote").mockReturnValue(fakeImage({ type: "mindMap" }) as any);
            const res = await api.get<string>("/api/images/someNote/file.svg");
            expect(res.status).toBe(200);
            expect(res.headers["Content-Type"]).toBe("image/svg+xml");
        });

        it("renders a spreadsheet note as a PNG attachment", async () => {
            vi.spyOn(becca, "getNote").mockReturnValue(
                fakeImage({
                    type: "spreadsheet",
                    getAttachmentByTitle: () => ({ getContent: () => Buffer.from([4, 5, 6]) })
                }) as any
            );
            const res = await api.get("/api/images/someNote/file.png");
            expect(res.status).toBe(200);
            expect(res.headers["Content-Type"]).toBe("image/png");
        });

        it("404s rendering a spreadsheet note without the PNG attachment", async () => {
            vi.spyOn(becca, "getNote").mockReturnValue(
                fakeImage({ type: "spreadsheet", getAttachmentByTitle: () => null }) as any
            );
            const res = await api.get("/api/images/someNote/file.png");
            expect(res.status).toBe(404);
        });
    });

    describe("returnImageFromRevision (GET /api/revisions/:revisionId/image/:filename)", () => {
        it("serves a raster image from a revision", async () => {
            vi.spyOn(becca, "getRevision").mockReturnValue(
                fakeImage({ type: "image", mime: "image/jpeg" }) as any
            );
            const res = await api.get("/api/revisions/rev123/image/file.jpg");
            expect(res.status).toBe(200);
            expect(res.headers["Content-Type"]).toBe("image/jpeg");
        });
    });

    describe("returnAttachedImage (GET /api/attachments/:attachmentId/image/:filename)", () => {
        function fakeAttachment(overrides: Record<string, unknown>) {
            return {
                attachmentId: "att1",
                role: "image",
                mime: "image/png",
                getContent: () => Buffer.from([7, 8, 9]),
                ...overrides
            };
        }

        it("404s when the attachment does not exist", async () => {
            vi.spyOn(becca, "getAttachment").mockReturnValue(null);
            const res = await api.get("/api/attachments/missing/image/file.png");
            expect(res.status).toBe(404);
        });

        it("400s when the attachment role is not image", async () => {
            vi.spyOn(becca, "getAttachment").mockReturnValue(fakeAttachment({ role: "file" }) as any);
            const res = await api.get("/api/attachments/att1/image/file.png");
            expect(res.status).toBe(400);
        });

        it("serves a raster attachment image", async () => {
            vi.spyOn(becca, "getAttachment").mockReturnValue(
                fakeAttachment({ role: "image", mime: "image/png" }) as any
            );
            const res = await api.get("/api/attachments/att1/image/file.png");
            expect(res.status).toBe(200);
            expect(res.headers["Content-Type"]).toBe("image/png");
        });

        it("sanitizes an SVG attachment image", async () => {
            vi.spyOn(becca, "getAttachment").mockReturnValue(
                fakeAttachment({
                    role: "image",
                    mime: "image/svg+xml",
                    getContent: () => "<svg><script>alert(2)</script></svg>"
                }) as any
            );
            const res = await api.get<string>("/api/attachments/att1/image/file.svg");
            expect(res.status).toBe(200);
            expect(res.headers["Content-Type"]).toBe("image/svg+xml");
            expect(res.body).not.toContain("alert(2)");
        });
    });

    describe("updateImage (PUT /api/images/:noteId)", () => {
        it("reports a missing file", async () => {
            const { noteId } = await createTextNote(api);
            const res = await api.put<{ uploaded: boolean; message: string }>(
                `/api/images/${noteId}`
            );
            expect(res.status).toBe(200);
            expect(res.body.uploaded).toBe(false);
            expect(res.body.message).toContain("Missing image data");
        });

        it("rejects an unknown mime type", async () => {
            const { noteId } = await createTextNote(api);
            const res = await api.put<{ uploaded: boolean }>(`/api/images/${noteId}`, {
                file: {
                    originalname: "x.txt",
                    mimetype: "text/plain",
                    buffer: Buffer.from([1]),
                    size: 1
                }
            });
            expect(res.status).toBe(200);
            expect(res.body.uploaded).toBe(false);
        });

        it("rejects a file whose buffer is a string", async () => {
            const { noteId } = await createTextNote(api);
            const res = await api.put<{ uploaded: boolean }>(`/api/images/${noteId}`, {
                file: {
                    originalname: "x.png",
                    mimetype: "image/png",
                    buffer: "not-a-buffer",
                    size: 1
                }
            });
            expect(res.status).toBe(200);
            expect(res.body.uploaded).toBe(false);
        });

        it("updates the image on success", async () => {
            const { noteId } = await createTextNote(api);
            const spy = vi.spyOn(imageService, "updateImage").mockReturnValue(undefined as any);

            const res = await api.put<{ uploaded: boolean }>(`/api/images/${noteId}`, {
                file: {
                    originalname: "x.png",
                    mimetype: "image/png",
                    buffer: Buffer.from([1, 2, 3]),
                    size: 3
                }
            });
            expect(res.status).toBe(200);
            expect(res.body.uploaded).toBe(true);
            expect(spy).toHaveBeenCalledOnce();
        });
    });
});

class MockResponse {

    body?: string;
    headers: Record<string, string>;

    constructor() {
        this.headers = {};
    }

    set(name: string, value: string) {
        this.headers[name] = value;
    }

    send(body: string) {
        this.body = body;
    }

}
