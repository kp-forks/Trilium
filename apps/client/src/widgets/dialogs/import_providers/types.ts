import type { ComponentChildren, ComponentType } from "preact";

export interface ImportProviderPanelProps {
    /** The note the imported tree should be created under. */
    parentNoteId: string;
    /** Closes the surrounding import dialog (e.g. once the import has been kicked off). */
    closeDialog: () => void;
    /** Renders content (e.g. the primary action) into the dialog's pinned modal footer; pass null to clear. */
    setFooter: (footer: ComponentChildren) => void;
}

/**
 * A pluggable source the generic import dialog can import from. Add a new provider by implementing
 * this interface and appending it to the registry in `index.ts`; the dialog wires up the rest.
 */
export interface ImportProvider {
    /** Stable identifier. */
    id: string;
    /** Human-readable name shown in the provider picker. */
    name: string;
    /** Boxicons class, e.g. `"bx bxl-microsoft"`. */
    icon: string;
    /** One-line description shown under the name. */
    description: string;
    /** The component rendered once this provider is chosen; it drives its own multi-step flow. */
    Panel: ComponentType<ImportProviderPanelProps>;
}
