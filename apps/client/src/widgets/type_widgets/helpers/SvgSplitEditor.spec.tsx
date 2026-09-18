import { type ComponentChildren, render } from "preact";
import { useEffect } from "preact/hooks";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SplitEditorProps } from "./SplitEditor";
import SvgSplitEditor from "./SvgSplitEditor";

// react-zoom-pan-pinch measures its boxes, which happy-dom cannot do. Render the children in place
// and capture the props so the bounds handed to the library can still be asserted.
const { transformWrapperSpy } = vi.hoisted(() => ({ transformWrapperSpy: vi.fn() }));

vi.mock("react-zoom-pan-pinch", () => ({
    TransformWrapper: (props: { children?: ComponentChildren }) => {
        transformWrapperSpy(props);
        return props.children;
    },
    TransformComponent: (props: { children?: ComponentChildren; wrapperClass?: string }) => (
        <div className={props.wrapperClass}>{props.children}</div>
    )
}));

// SplitEditor pulls in CodeMirror, Split.js and a Bootstrap ribbon that have nothing to do with
// the pan/zoom behavior under test; stub it down to just the preview pane, and fire the same
// `onContentChanged` callback the real editor would once content arrives.
vi.mock("./SplitEditor", () => ({
    default: ({ previewContent, onContentChanged }: SplitEditorProps) => {
        useEffect(() => {
            onContentChanged?.("gantt\nsection Test\nTask: 2024-01-01, 1d");
        }, []);
        return <div>{previewContent}</div>;
    }
}));

const ORIGINAL_VIEW_BOX = "0 0 1234 56";
const SVG_MARKUP = `<svg viewBox="${ORIGINAL_VIEW_BOX}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect width="10" height="10"/></svg>`;

describe("SvgSplitEditor", () => {
    beforeEach(() => transformWrapperSpy.mockClear());

    it("renders the diagram inside the pan/zoom viewport, with its viewBox untouched", async () => {
        const { container, unmount } = await mount();

        const svgEl = container.querySelector(".svg-preview-viewport .render-container svg");
        expect(svgEl).not.toBeNull();
        // The fit comes from the viewBox rather than from a measured scale, so nothing may strip it
        // — svg-pan-zoom used to, which shrank gantt charts to invisibility on a re-fit (#9749).
        expect(svgEl?.getAttribute("viewBox")).toBe(ORIGINAL_VIEW_BOX);

        unmount();
        container.remove();
    });

    it("bounds the zoom as a multiple of the fitted view", async () => {
        const { container, unmount } = await mount();

        expect(transformWrapperSpy).toHaveBeenCalledWith(
            expect.objectContaining({ minScale: 0.5, maxScale: 10 })
        );

        unmount();
        container.remove();
    });
});

/** Mounts `SvgSplitEditor` and waits for the rendered diagram to appear. */
async function mount() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
        render(<SvgSplitEditor {...svgSplitEditorProps(SVG_MARKUP)} />, container);
    });

    await vi.waitFor(() => expect(container.querySelector("svg")).not.toBeNull());

    return { container, unmount: () => act(() => render(null, container)) };
}

/**
 * Minimal props for `SvgSplitEditor`; SplitEditor is mocked away, so most of `SplitEditorProps`
 * is unused.
 */
function svgSplitEditorProps(svgMarkup: string) {
    const note = {
        noteId: "note1",
        title: "Gantt",
        getAttachments: async () => []
    };

    return {
        ntxId: "ntx1",
        note,
        noteContext: {},
        attachmentTitle: "gantt-export.svg",
        renderSvg: async () => svgMarkup
    } as unknown as Parameters<typeof SvgSplitEditor>[0];
}
