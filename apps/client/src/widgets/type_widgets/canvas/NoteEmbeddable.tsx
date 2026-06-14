import { useEffect, useRef } from "preact/hooks";
import content_renderer from "../../../services/content_renderer";
import froca from "../../../services/froca";
import "./NoteEmbeddable.css";

/**
 * Renders an arbitrary Trilium note inside an Excalidraw embeddable element, reusing the shared
 * {@link content_renderer}. Excalidraw hands us a sized box (via its `renderEmbeddable` prop); we
 * mount the rendered note content into it, opting into `interactive` so live note types
 * (collections, web views) behave the same as they do in an included note.
 */
export default function NoteEmbeddable({ noteId }: { noteId: string }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        const container = ref.current;
        if (!container) {
            return;
        }

        (async () => {
            const note = await froca.getNote(noteId);
            if (!note || cancelled) {
                return;
            }

            const { $renderedContent } = await content_renderer.getRenderedContent(note, { interactive: true });
            if (cancelled) {
                return;
            }

            container.replaceChildren(...$renderedContent.toArray());
        })();

        return () => {
            cancelled = true;
        };
    }, [noteId]);

    return <div ref={ref} className="canvas-note-embeddable ck-content" />;
}
