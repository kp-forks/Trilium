import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import $ from "jquery";

// Control the bundle execution machinery (avoids eval / ScriptContext).
const executeMock = vi.fn();
vi.mock("./bundle.js", () => ({
    executeBundleWithoutErrorHandling: (...args: unknown[]) => executeMock(...args)
}));

// Spy on the actual JSX rendering so we don't depend on Preact mounting.
const renderAtElementMock = vi.fn();
vi.mock("../widgets/react/react_utils.jsx", () => ({
    renderReactWidgetAtElement: (...args: unknown[]) => renderAtElementMock(...args)
}));

import { buildNote } from "../test/easy-froca";
import froca from "./froca.js";
import renderDefault, { render, renderIfJsx } from "./render.js";
import server from "./server.js";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("render", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: a successful bundle execution resolving to nothing.
        executeMock.mockResolvedValue(undefined);
        server.postWithSilentInternalServerError = vi.fn(async () => ({
            script: "",
            html: "<p>hi</p>",
            noteId: "scriptNote",
            allNoteIds: []
        })) as typeof server.postWithSilentInternalServerError;
    });

    afterEach(() => {
        delete (glob as any).getComponentByEl;
    });

    it("default export exposes render", () => {
        expect(renderDefault.render).toBe(render);
    });

    it("empties and hides the element when there are no renderNote relations", async () => {
        const note = buildNote({ title: "No relations" });
        const $el = $("<div>").append("<span>old</span>");

        const result = await render(note, $el);

        expect(result).toBe(false);
        expect($el.children().length).toBe(0);
        expect($el.css("display")).toBe("none");
        expect(server.postWithSilentInternalServerError).not.toHaveBeenCalled();
    });

    it("ignores relations whose value is empty (filtered out)", async () => {
        const note = buildNote({ title: "Empty value", "~renderNote": "" });
        const $el = $("<div>");

        const result = await render(note, $el);

        expect(result).toBe(false);
        expect(server.postWithSilentInternalServerError).not.toHaveBeenCalled();
    });

    it("loads, appends bundle html and executes the bundle for each render note", async () => {
        const target = buildNote({ title: "Target" });
        const note = buildNote({ title: "Host", "~renderNote": target.noteId });
        const $el = $("<div>");

        const result = await render(note, $el);

        expect(result).toBe(true);
        expect(server.postWithSilentInternalServerError).toHaveBeenCalledWith(`script/bundle/${target.noteId}`);
        expect($el.css("display")).not.toBe("none");
        // A script container div was appended and got the bundle html.
        const $container = $el.children();
        expect($container.length).toBe(1);
        expect($container.html()).toContain("hi");
        expect(executeMock).toHaveBeenCalledOnce();
    });

    it("invokes onError when the bundle could not be loaded", async () => {
        const target = buildNote({ title: "Target2" });
        const note = buildNote({ title: "Host2", "~renderNote": target.noteId });
        server.postWithSilentInternalServerError = vi.fn(async () => null) as typeof server.postWithSilentInternalServerError;
        const onError = vi.fn();

        const result = await render(note, $("<div>"), onError);

        // The throw is caught, so render resolves to undefined.
        expect(result).toBeUndefined();
        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it("forwards bundle execution rejections to onError via catch", async () => {
        const target = buildNote({ title: "Target3" });
        const note = buildNote({ title: "Host3", "~renderNote": target.noteId });
        const boom = new Error("exec failed");
        executeMock.mockRejectedValue(boom);
        const onError = vi.fn();

        await render(note, $("<div>"), onError);
        await flush();

        expect(onError).toHaveBeenCalledWith(boom);
    });

    it("parses a JSON-shaped string error and passes the parsed object to onError", async () => {
        const target = buildNote({ title: "Target4" });
        const note = buildNote({ title: "Host4", "~renderNote": target.noteId });
        server.postWithSilentInternalServerError = vi.fn(async () => {
            throw `{"message":"nope"}`;
        }) as typeof server.postWithSilentInternalServerError;
        const onError = vi.fn();

        await render(note, $("<div>"), onError);

        expect(onError).toHaveBeenCalledWith({ message: "nope" });
    });

    it("falls back to passing the raw error when a JSON-shaped string fails to parse", async () => {
        const target = buildNote({ title: "Target5" });
        const note = buildNote({ title: "Host5", "~renderNote": target.noteId });
        const bad = `{not valid json}`;
        server.postWithSilentInternalServerError = vi.fn(async () => {
            throw bad;
        }) as typeof server.postWithSilentInternalServerError;
        const onError = vi.fn();

        await render(note, $("<div>"), onError);

        // Inner try/catch: JSON.parse throws, the parse error is forwarded.
        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0][0]).toBeInstanceOf(SyntaxError);
    });

    it("passes a non-string thrown error straight to onError", async () => {
        const target = buildNote({ title: "Target6" });
        const note = buildNote({ title: "Host6", "~renderNote": target.noteId });
        const err = new Error("plain");
        server.postWithSilentInternalServerError = vi.fn(async () => {
            throw err;
        }) as typeof server.postWithSilentInternalServerError;
        const onError = vi.fn();

        await render(note, $("<div>"), onError);

        expect(onError).toHaveBeenCalledWith(err);
    });

    it("triggers JSX rendering when the bundle html is empty", async () => {
        const target = buildNote({ title: "Target7", type: "code" });
        // The root script note must be JSX for renderIfJsx to render.
        const jsxNote = buildNote({ id: "jsxRoot", title: "JSX root" });
        jsxNote.mime = "text/jsx";
        const note = buildNote({ title: "Host7", "~renderNote": target.noteId });

        const userComponent = () => null;
        executeMock.mockResolvedValue(userComponent);
        server.postWithSilentInternalServerError = vi.fn(async () => ({
            script: "",
            html: "",
            noteId: "jsxRoot",
            allNoteIds: []
        })) as typeof server.postWithSilentInternalServerError;

        const closest = { fake: "component" };
        (glob as any).getComponentByEl = vi.fn(() => closest);

        const $el = $("<div class='component'>");
        await render(note, $el, vi.fn());
        await flush();

        expect(renderAtElementMock).toHaveBeenCalledOnce();
        expect(renderAtElementMock.mock.calls[0][0]).toBe(closest);
        expect(renderAtElementMock.mock.calls[0][2]).toBe($el[0]);
    });
});

describe("renderIfJsx", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        delete (glob as any).getComponentByEl;
    });

    function bundleFor(noteId: string) {
        return { script: "", html: "", noteId, allNoteIds: [] };
    }

    it("does nothing when the root script note is not text/jsx", async () => {
        const note = buildNote({ title: "Non-jsx" });
        note.mime = "text/html";
        await renderIfJsx(bundleFor(note.noteId), () => null, $("<div>"));
        expect(renderAtElementMock).not.toHaveBeenCalled();
    });

    it("does nothing when the resolved root note is missing", async () => {
        const originalGetNote = froca.getNote;
        froca.getNote = vi.fn(async () => null) as typeof froca.getNote;
        try {
            await renderIfJsx(bundleFor("does-not-exist"), () => null, $("<div>"));
        } finally {
            froca.getNote = originalGetNote;
        }
        expect(renderAtElementMock).not.toHaveBeenCalled();
    });

    it("does nothing when the bundle result is not a function", async () => {
        const note = buildNote({ title: "Jsx but bad result" });
        note.mime = "text/jsx";
        await renderIfJsx(bundleFor(note.noteId), "not a function", $("<div>"));
        expect(renderAtElementMock).not.toHaveBeenCalled();
    });

    it("does nothing when there is no closest component", async () => {
        const note = buildNote({ title: "Jsx no component" });
        note.mime = "text/jsx";
        (glob as any).getComponentByEl = vi.fn(() => null);
        await renderIfJsx(bundleFor(note.noteId), () => null, $("<div class='component'>"));
        expect(renderAtElementMock).not.toHaveBeenCalled();
    });

    it("renders the user component wrapped in an error boundary", async () => {
        const note = buildNote({ title: "Jsx ok" });
        note.mime = "text/jsx";
        const closest = { id: "c" };
        (glob as any).getComponentByEl = vi.fn(() => closest);

        const $el = $("<div class='component'>");
        await renderIfJsx(bundleFor(note.noteId), () => null, $el);

        expect(renderAtElementMock).toHaveBeenCalledOnce();
        const [parentComp, vnode, container] = renderAtElementMock.mock.calls[0];
        expect(parentComp).toBe(closest);
        expect(container).toBe($el[0]);
        // The vnode is the UserErrorBoundary wrapping the user component.
        expect(typeof vnode.type).toBe("function");
        expect(vnode.type.name).toBe("UserErrorBoundary");
    });

    it("error boundary renders children normally and swallows errors via componentDidCatch", async () => {
        const note = buildNote({ title: "Jsx boundary" });
        note.mime = "text/jsx";
        const closest = { id: "c2" };
        (glob as any).getComponentByEl = vi.fn(() => closest);
        const onError = vi.fn();

        await renderIfJsx(bundleFor(note.noteId), () => null, $("<div class='component'>"), onError);

        const vnode = renderAtElementMock.mock.calls[0][1];
        const Boundary = vnode.type as new (props: object) => {
            state: { error: unknown };
            props: { children?: unknown };
            setState: (s: object) => void;
            componentDidCatch: (e: unknown) => void;
            render: () => unknown;
        };
        const children = { marker: true };
        const instance = new Boundary({ children });
        instance.setState = (s: object) => Object.assign(instance.state, s);

        // Initial state: no error -> renders children.
        expect(instance.state.error).toBeNull();
        expect(instance.render()).toBe(children);

        // After catching an error: forwards to onError and renders null.
        const caught = new Error("inner");
        instance.componentDidCatch(caught);
        expect(onError).toHaveBeenCalledWith(caught);
        expect(instance.state.error).toBe(caught);
        expect(instance.render()).toBeNull();
    });
});
