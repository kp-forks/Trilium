import type { Editor } from "ckeditor5";

/**
 * Hack coming from https://github.com/ckeditor/ckeditor5/issues/4465
 * Prevents CKEditor from handling events inside widget UI elements.
 */
export function preventCKEditorHandling(domElement: HTMLElement, editor: Editor) {
    domElement.addEventListener("mousedown", stopEventPropagationAndHackRendererFocus, { capture: true });
    domElement.addEventListener("focus", stopEventPropagationAndHackRendererFocus, { capture: true });
    domElement.addEventListener("keydown", stopEventPropagationAndHackRendererFocus, { capture: true });

    function stopEventPropagationAndHackRendererFocus(evt: Event) {
        evt.stopPropagation();
        // This prevents rendering changed view selection thus preventing to changing DOM selection while inside a widget.
        //@ts-expect-error: We are accessing a private field.
        editor.editing.view._renderer.isFocused = false;
    }
}
