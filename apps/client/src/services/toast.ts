import { signal } from "@preact/signals";

import appContext from "../components/app_context.js";
import froca from "./froca.js";
import { t } from "./i18n.js";
import utils, { randomString } from "./utils.js";

export interface ToastOptions {
    id?: string;
    icon: string;
    title?: string;
    message: string;
    timeout?: number;
    progress?: number;
    /**
     * When `false`, the toast renders without its close (×) button so the user can't dismiss it. Use for
     * persistent in-progress toasts whose underlying operation keeps running regardless of the toast — a
     * dismissable × there reads as "cancel", which it isn't. Defaults to dismissable.
     */
    dismissible?: boolean;
    /**
     * Notes to render as reference links in the toast body — e.g. the notes an action affected or that
     * triggered the message. Each is shown with its icon and title and navigates to the note on click.
     */
    noteIds?: string[];
    /** Optional heading rendered above the {@link noteIds} reference-link list. */
    notesHeading?: string;
    /**
     * Invoked once when the toast is removed, whether it auto-hid after its timeout or was dismissed by the
     * user. Useful for resetting state that accumulated while the toast was live (see {@link noteIds}).
     */
    onRemove?: () => void;
    buttons?: {
        text: string;
        onClick: (api: { dismissToast: () => void }) => void;
    }[];
}

export type ToastOptionsWithRequiredId = Omit<ToastOptions, "id"> & Required<Pick<ToastOptions, "id">>;

function showPersistent(options: ToastOptionsWithRequiredId) {
    const existingToast = toasts.value.find(toast => toast.id === options.id);
    if (existingToast) {
        updateToast(options.id, options);
    } else {
        addToast(options);
    }
}

function closePersistent(id: string) {
    removeToastFromStore(id);
}

function showMessage(message: string, timeout = 2000, icon = "bx bx-check") {
    console.debug(utils.now(), "message:", message);

    addToast({
        icon,
        message,
        timeout
    });
}

export function showError(message: string, timeout = 10000) {
    console.log(utils.now(), "error: ", message);

    addToast({
        icon: "bx bx-error-circle",
        message,
        timeout
    });
}

function showErrorTitleAndMessage(title: string, message: string, timeout = 10000) {
    console.log(utils.now(), "error: ", message);

    addToast({
        title,
        icon: "bx bx-error-circle",
        message,
        timeout
    });
}

export async function showErrorForScriptNote(noteId: string, message: string) {
    const note = await froca.getNote(noteId, true);

    showPersistent({
        id: `custom-widget-failure-${noteId}`,
        title: t("toast.scripting-error", { title: note?.title ?? "" }),
        icon: note?.getIcon() ?? "bx bx-error-circle",
        message,
        timeout: 15_000,
        buttons: [
            {
                text: t("toast.open-script-note"),
                onClick: () => appContext.tabManager.openInNewTab(noteId, null, true)
            }
        ]
    });
}

//#region Toast store
export const toasts = signal<ToastOptionsWithRequiredId[]>([]);

function addToast(opts: ToastOptions) {
    const id = opts.id ?? randomString();
    const toast = { ...opts, id };
    toasts.value = [ ...toasts.value, toast ];
    return id;
}

function updateToast(id: string, partial: Partial<ToastOptions>) {
    toasts.value = toasts.value.map(toast => {
        if (toast.id === id) {
            return { ...toast, ...partial };
        }
        return toast;
    });
}

export function removeToastFromStore(id: string) {
    // Centralized removal point, so onRemove fires exactly once regardless of the removal path
    // (auto-hide timeout, close button, or closePersistent). find-then-filter guards against a
    // double fire when both the timeout and a manual dismiss race for the same id.
    const removed = toasts.value.find(toast => toast.id === id);
    if (!removed) {
        return;
    }
    removed.onRemove?.();
    toasts.value = toasts.value.filter(toast => toast.id !== id);
}
//#endregion

export default {
    showMessage,
    showError,
    showErrorTitleAndMessage,
    showPersistent,
    closePersistent
};
