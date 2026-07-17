import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";

// Stub NoteLink so we don't pull in its async link.createLink / froca machinery; we only need to
// know that one is rendered per noteId.
vi.mock("./react/NoteLink", async () => {
    const { h } = await import("preact");
    return { default: (props: { notePath: string }) => h("span", { class: "note-link-stub", "data-note-id": props.notePath }) };
});

import { toasts, type ToastOptionsWithRequiredId } from "../services/toast";
import ToastContainer from "./Toast";

let container: HTMLDivElement | undefined;

function renderToasts(items: ToastOptionsWithRequiredId[]) {
    toasts.value = items;
    container = document.createElement("div");
    document.body.appendChild(container);
    render(<ToastContainer />, container);
    return container;
}

afterEach(() => {
    toasts.value = [];
    if (container) {
        render(null, container);
        container.remove();
        container = undefined;
    }
});

describe("Toast rendering", () => {
    it("renders reference-note links (with heading) and a monospace message body", () => {
        const el = renderToasts([ {
            id: "err",
            icon: "bx bx-error-circle",
            title: "Failed",
            message: "api.logg is not a function",
            messageMonospace: true,
            notesHeading: "Scripts that failed:",
            noteIds: [ "noteA", "noteB" ]
        } ]);

        const body = el.querySelector(".toast-body");
        expect(body?.className).toContain("monospace");
        expect(body?.textContent).toContain("api.logg is not a function");

        const notes = el.querySelector(".toast-notes");
        expect(notes).not.toBeNull();
        expect(notes?.querySelector(".toast-notes-heading")?.textContent).toBe("Scripts that failed:");
        expect(el.querySelectorAll(".note-link-stub")).toHaveLength(2);
    });

    it("omits the notes section and the monospace class when neither is provided", () => {
        const el = renderToasts([ { id: "ok", icon: "bx bx-check", message: "done" } ]);

        expect(el.querySelector(".toast-notes")).toBeNull();
        expect(el.querySelector(".toast.no-title .toast-body")?.className).not.toContain("monospace");
    });

    it("applies the monospace class in the no-title layout too", () => {
        const el = renderToasts([ { id: "mono", icon: "bx bx-x", message: "raw error", messageMonospace: true } ]);

        expect(el.querySelector(".toast.no-title .toast-body")?.className).toContain("monospace");
    });
});
