import { ComponentType } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";

import type { EventData, EventNames } from "../components/app_context.js";
import type RootContainer from "../widgets/containers/root_container.js";
import AddLinkDialog from "../widgets/dialogs/add_link.js";
import BranchPrefixDialog from "../widgets/dialogs/branch_prefix.js";
import CallToActionDialog from "../widgets/dialogs/call_to_action.jsx";
import CloneToDialog from "../widgets/dialogs/clone_to.js";
import ConfirmDialog from "../widgets/dialogs/confirm.js";
import DeleteNotesDialog from "../widgets/dialogs/delete_notes.js";
import ExportDialog from "../widgets/dialogs/export.js";
import HelpDialog from "../widgets/dialogs/help.js";
import ImportDialog from "../widgets/dialogs/import.js";
import IncludeNoteDialog from "../widgets/dialogs/include_note.js";
import IncorrectCpuArchDialog from "../widgets/dialogs/incorrect_cpu_arch.js";
import InfoDialog from "../widgets/dialogs/info.js";
import JumpToNoteDialog from "../widgets/dialogs/jump_to_note.js";
import LinkEmbedDialog from "../widgets/dialogs/link_embed.js";
import MarkdownImportDialog from "../widgets/dialogs/markdown_import.js";
import MoveToDialog from "../widgets/dialogs/move_to.js";
import NoteTypeChooserDialog from "../widgets/dialogs/note_type_chooser.js";
import OcrTextDialog from "../widgets/dialogs/ocr_text.js";
import OptionsDialog from "../widgets/dialogs/OptionsDialog.jsx";
import PopupEditorDialog from "../widgets/dialogs/PopupEditor.jsx";
import PrintPreviewDialog from "../widgets/dialogs/print_preview.jsx";
import PromptDialog from "../widgets/dialogs/prompt.js";
import ProtectedSessionPasswordDialog from "../widgets/dialogs/protected_session_password.js";
import RecentChangesDialog from "../widgets/dialogs/recent_changes.js";
import RevisionsDialog from "../widgets/dialogs/revisions.js";
import SortChildNotesDialog from "../widgets/dialogs/sort_child_notes.js";
import UploadAttachmentsDialog from "../widgets/dialogs/upload_attachments.js";
import { useTriliumEvents } from "../widgets/react/hooks.jsx";
import { ParentComponent } from "../widgets/react/react_utils.jsx";
import ToastContainer from "../widgets/Toast.jsx";

export function applyModals(rootContainer: RootContainer) {
    rootContainer
        .child(<LazyDialog triggerEvents={["openBulkActionsDialog"]} loader={() => import("../widgets/dialogs/bulk_actions.js")} />)
        .child(<LazyDialog triggerEvents={["openAboutDialog"]} loader={() => import("../widgets/dialogs/about.js")} />)
        .child(<HelpDialog />)
        .child(<RecentChangesDialog />)
        .child(<BranchPrefixDialog />)
        .child(<SortChildNotesDialog />)
        .child(<IncludeNoteDialog />)
        .child(<LinkEmbedDialog />)
        .child(<NoteTypeChooserDialog />)
        .child(<JumpToNoteDialog />)
        .child(<AddLinkDialog />)
        .child(<CloneToDialog />)
        .child(<MoveToDialog />)
        .child(<ImportDialog />)
        .child(<ExportDialog />)
        .child(<MarkdownImportDialog />)
        .child(<ProtectedSessionPasswordDialog />)
        .child(<RevisionsDialog />)
        .child(<DeleteNotesDialog />)
        .child(<PrintPreviewDialog />)
        .child(<InfoDialog />)
        .child(<ConfirmDialog />)
        .child(<PromptDialog />)
        .child(<IncorrectCpuArchDialog />)
        .child(<PopupEditorDialog />)
        .child(<OptionsDialog />)
        .child(<CallToActionDialog />)
        .child(<OcrTextDialog />)
        .child(<UploadAttachmentsDialog />)
        .child(<ToastContainer />);
}

interface LazyDialogProps {
    /** Loader returning the module whose default export is the dialog component, e.g. `() => import("../widgets/dialogs/about.js")`. */
    loader: () => Promise<{ default: ComponentType }>;
    /** The events that summon this dialog; the first one to fire loads and mounts it. */
    triggerEvents: EventNames[];
}

/**
 * Mounts a dialog on demand: dialogs are summoned via events (with any results reported through
 * callbacks in the event data), so until the first summons there is no reason to have the dialog
 * or its module graph around. Once loaded, the dialog stays mounted and handles further events
 * itself.
 *
 * The buffered first event is re-delivered through the subtree's host component, which only
 * notifies handlers registered within this subtree (the wrapper and the dialog), not the rest of
 * the application. The re-delivery happens in an effect because parent effects run after the
 * children's, guaranteeing that the dialog's own event handlers are registered by then.
 *
 * Limitation: a second summons arriving while the dialog module is still being fetched replaces
 * the buffered event rather than queueing behind it.
 */
function LazyDialog({ loader, triggerEvents }: LazyDialogProps) {
    const parentComponent = useContext(ParentComponent);
    const [ Component, setComponent ] = useState<ComponentType>();
    const [ pendingEvent, setPendingEvent ] = useState<{ name: EventNames, data: unknown }>();

    useTriliumEvents(triggerEvents, async (data, name) => {
        // Once mounted, the dialog receives events directly through the shared host component.
        if (Component) return;
        const module = await loader();
        setComponent(() => module.default);
        setPendingEvent({ name, data });
    });

    useEffect(() => {
        if (!Component || !pendingEvent) return;
        void parentComponent?.handleEvent(pendingEvent.name, pendingEvent.data as EventData<EventNames>);
        setPendingEvent(undefined);
    }, [ Component, pendingEvent, parentComponent ]);

    return <div className="lazy-component">{Component && <Component />}</div>;
}
