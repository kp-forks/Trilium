import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import becca from "../../becca/becca";
import becca_loader from "../../becca/becca_loader";
import enexImportService from "../../services/import/enex";
import opmlImportService from "../../services/import/opml";
import singleImportService from "../../services/import/single";
import zipImportService from "../../services/import/zip";
import TaskContext from "../../services/task_context";
import { createTextNote } from "../../test/api_fixtures";
import { CoreApiTester } from "../../test/api_tester";

/**
 * Drives the shared core import routes through {@link CoreApiTester} (no
 * Express). The heavy import services are stubbed with `vi.spyOn` so we only
 * exercise the route's branching (extension dispatch, error handling, the
 * `last === "true"` timer). Runs under both the node and standalone suites.
 */
let api: CoreApiTester;
let parentNoteId: string;

function fakeNote(noteId = "fakeNote123") {
    return { noteId, getPojo: () => ({ noteId, title: "fake" }) } as any;
}

function file(originalname: string, buffer: any = Buffer.from("hi")) {
    return { originalname, mimetype: "text/plain", buffer, size: 2 };
}

describe("Import API (core)", () => {
    beforeAll(async () => {
        api = CoreApiTester.build();
        ({ noteId: parentNoteId } = await createTextNote(api));
        // becca_loader.load() is invoked by the route on success; no-op it so the
        // stubbed-out import doesn't trigger a real cache reload.
        vi.spyOn(becca_loader, "load").mockReturnValue(undefined as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        // restore the load() stub that restoreAllMocks just cleared
        vi.spyOn(becca_loader, "load").mockReturnValue(undefined as any);
    });

    describe("importNotesToBranch", () => {
        it("rejects when no file is uploaded", async () => {
            const res = await api.post(`/api/notes/${parentNoteId}/notes-import`, { body: {} });
            expect(res.status).toBe(400);
        });

        it("imports a single (default extension) file and returns the note pojo", async () => {
            const spy = vi.spyOn(singleImportService, "importSingleFile").mockReturnValue(fakeNote());

            const res = await api.post(`/api/notes/${parentNoteId}/notes-import`, {
                body: {},
                file: file("x.txt")
            });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ noteId: "fakeNote123" });
            expect(spy).toHaveBeenCalled();
        });

        it("dispatches .zip archives to the zip importer", async () => {
            const spy = vi.spyOn(zipImportService, "importZip").mockResolvedValue(fakeNote("zipNote"));

            const res = await api.post(`/api/notes/${parentNoteId}/notes-import`, {
                body: {},
                file: file("x.zip")
            });

            expect(res.status).toBe(200);
            expect(spy).toHaveBeenCalled();
        });

        it("dispatches .opml archives to the opml importer (note result)", async () => {
            vi.spyOn(opmlImportService, "importOpml").mockResolvedValue(fakeNote("opmlNote"));

            const res = await api.post(`/api/notes/${parentNoteId}/notes-import`, {
                body: {},
                file: file("x.opml")
            });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ noteId: "opmlNote" });
        });

        it("returns the array result early for .opml importers that return an array", async () => {
            vi.spyOn(opmlImportService, "importOpml").mockResolvedValue([{ a: 1 }] as any);

            const res = await api.post(`/api/notes/${parentNoteId}/notes-import`, {
                body: {},
                file: file("x.opml")
            });

            expect(res.status).toBe(200);
            expect(res.body).toEqual([{ a: 1 }]);
        });

        it("dispatches .enex archives to the enex importer (note result)", async () => {
            vi.spyOn(enexImportService, "importEnex").mockResolvedValue(fakeNote("enexNote"));

            const res = await api.post(`/api/notes/${parentNoteId}/notes-import`, {
                body: {},
                file: file("x.enex")
            });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ noteId: "enexNote" });
        });

        it("returns the array result early for .enex importers that return an array", async () => {
            vi.spyOn(enexImportService, "importEnex").mockResolvedValue([{ b: 2 }] as any);

            const res = await api.post(`/api/notes/${parentNoteId}/notes-import`, {
                body: {},
                file: file("x.enex")
            });

            expect(res.status).toBe(200);
            expect(res.body).toEqual([{ b: 2 }]);
        });

        it("returns 500 when the importer throws", async () => {
            vi.spyOn(singleImportService, "importSingleFile").mockImplementation(() => {
                throw new Error("boom");
            });

            const res = await api.post(`/api/notes/${parentNoteId}/notes-import`, {
                body: {},
                file: file("x.txt")
            });

            expect(res.status).toBe(500);
        });

        it("returns 500 when no note is generated", async () => {
            vi.spyOn(singleImportService, "importSingleFile").mockReturnValue(null as any);

            const res = await api.post(`/api/notes/${parentNoteId}/notes-import`, {
                body: {},
                file: file("x.txt")
            });

            expect(res.status).toBe(500);
        });

        it("schedules taskSucceeded when last === 'true'", async () => {
            vi.useFakeTimers();
            vi.spyOn(singleImportService, "importSingleFile").mockReturnValue(fakeNote());
            const succeeded = vi.spyOn(TaskContext.prototype, "taskSucceeded").mockReturnValue(undefined as any);

            const res = await api.post(`/api/notes/${parentNoteId}/notes-import`, {
                body: { last: "true" },
                file: file("x.txt")
            });

            expect(res.status).toBe(200);
            vi.runAllTimers();
            expect(succeeded).toHaveBeenCalledWith(
                expect.objectContaining({ parentNoteId, importedNoteId: "fakeNote123" })
            );
        });
    });

    describe("importAttachmentsToNote", () => {
        it("rejects when no file is uploaded", async () => {
            const res = await api.post(`/api/notes/${parentNoteId}/attachments-import`, { body: {} });
            expect(res.status).toBe(400);
        });

        it("imports an attachment", async () => {
            const spy = vi.spyOn(singleImportService, "importAttachment").mockReturnValue(undefined as any);

            const res = await api.post(`/api/notes/${parentNoteId}/attachments-import`, {
                body: {},
                file: file("x.txt")
            });

            expect(res.status).toBe(204);
            expect(spy).toHaveBeenCalled();
        });

        it("returns 500 when the attachment importer throws", async () => {
            vi.spyOn(singleImportService, "importAttachment").mockImplementation(() => {
                throw new Error("boom");
            });

            const res = await api.post(`/api/notes/${parentNoteId}/attachments-import`, {
                body: {},
                file: file("x.txt")
            });

            expect(res.status).toBe(500);
        });

        it("schedules taskSucceeded when last === 'true'", async () => {
            vi.useFakeTimers();
            vi.spyOn(singleImportService, "importAttachment").mockReturnValue(undefined as any);
            const succeeded = vi.spyOn(TaskContext.prototype, "taskSucceeded").mockReturnValue(undefined as any);

            const res = await api.post(`/api/notes/${parentNoteId}/attachments-import`, {
                body: { last: "true" },
                file: file("x.txt")
            });

            expect(res.status).toBe(204);
            vi.runAllTimers();
            expect(succeeded).toHaveBeenCalledWith(expect.objectContaining({ parentNoteId }));
        });
    });

    it("becca lookup of the parent is exercised via a real fixture note", () => {
        expect(becca.getNote(parentNoteId)).toBeTruthy();
    });
});
