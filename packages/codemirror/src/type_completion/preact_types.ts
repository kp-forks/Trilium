// Real Preact type declarations injected into the JSX script-note vfs so the
// `trilium:preact` import (and JSX intrinsic elements) resolve to actual types
// rather than `any`.
//
// JSX render notes run Preact's classic `h`/`Fragment` transform at runtime
// (see `buildJsx` in `packages/trilium-core/src/services/script.ts`), but the
// language service only *type-checks* — it never emits. So for checking we use
// the modern automatic runtime (`jsx: ReactJSX`, `jsxImportSource: "preact"`),
// which resolves the full `JSX.IntrinsicElements` namespace from
// `preact/jsx-runtime`. This avoids hand-authoring every HTML element's props.
//
// Like `jquery_types.ts`, the .d.ts text is read with relative `?raw` imports at
// build time, so it tracks the installed `preact` version with no vendored
// snapshot and lands in the lazy script-editor chunk (loaded only when a JSX
// note opens).
import hooksIndex from "../../../../node_modules/preact/hooks/src/index.d.ts?raw";
import jsxRuntime from "../../../../node_modules/preact/jsx-runtime/src/index.d.ts?raw";
import preactDom from "../../../../node_modules/preact/src/dom.d.ts?raw";
import preactIndex from "../../../../node_modules/preact/src/index.d.ts?raw";
import preactJsx from "../../../../node_modules/preact/src/jsx.d.ts?raw";

/**
 * Minimal `package.json` shims so the vfs's node10 module resolution finds each
 * subpath's `types` entry (`exports` maps are ignored under node10). The four
 * `.d.ts` files reference each other via the bare `preact` / `preact/...`
 * specifiers and relative paths, so the directory layout must match the real
 * package.
 */
function typesPackageJson(): string {
    return JSON.stringify({ types: "src/index.d.ts" });
}

/**
 * Virtual files placed under `/node_modules/preact` so `import … from "preact"`,
 * `"preact/hooks"` and `"preact/jsx-runtime"` resolve. Keyed by absolute vfs
 * path. Merge into the JSX env's file map.
 */
export const preactVfsFiles: Record<string, string> = {
    "/node_modules/preact/package.json": typesPackageJson(),
    "/node_modules/preact/src/index.d.ts": preactIndex,
    "/node_modules/preact/src/jsx.d.ts": preactJsx,
    "/node_modules/preact/src/dom.d.ts": preactDom,
    "/node_modules/preact/hooks/package.json": typesPackageJson(),
    "/node_modules/preact/hooks/src/index.d.ts": hooksIndex,
    "/node_modules/preact/jsx-runtime/package.json": typesPackageJson(),
    "/node_modules/preact/jsx-runtime/src/index.d.ts": jsxRuntime
};

/**
 * Ambient declarations for the bare-specifier imports a JSX render note uses.
 *
 *  - `trilium:preact` mirrors the runtime `api.preact` surface: it re-exports
 *    Preact core + all hooks, plus Trilium's `defineWidget`/`defineLauncherWidget`
 *    and the bundled UI components with curated prop types. Following
 *    `script_api.ts`'s philosophy, the genuinely useful props (enums, flags,
 *    callbacks) are typed precisely while references into the heavy client widget
 *    graph (editor instances, bootstrap options, note view scopes, …) are
 *    loosened to `unknown`/`Record` rather than dragging in their real types.
 *  - `trilium:api` exposes the same object as the `api` global.
 */
export const triliumModulesDts = `
declare module "trilium:preact" {
    import type { ComponentChild, ComponentChildren, FunctionComponent, RefObject, VNode } from "preact";
    export * from "preact";
    export * from "preact/hooks";

    /** A CSS style object (loose: property names are not validated). */
    type Css = Record<string, string | number>;
    /** A Trilium command name (loosened from the client's \`CommandNames\` union). */
    type Cmd = string;

    export interface WidgetDefinition {
        parent: "right-pane";
        render: () => VNode;
        position?: number;
    }
    export function defineWidget(definition: WidgetDefinition): WidgetDefinition & { type: "preact-widget" };
    export function defineLauncherWidget(definition: { render: () => VNode }): { type: "preact-launcher-widget"; render: () => VNode };

    export interface ActionButtonProps {
        text: string;
        icon: string;
        className?: string;
        titlePosition?: "top" | "right" | "bottom" | "left";
        triggerCommand?: Cmd;
        noIconActionClass?: boolean;
        frame?: boolean;
        active?: boolean;
        disabled?: boolean;
        onClick?: (e: MouseEvent) => void;
        onAuxClick?: (e: MouseEvent) => void;
        onContextMenu?: (e: MouseEvent) => void;
        style?: Css;
    }
    export const ActionButton: FunctionComponent<ActionButtonProps>;

    export interface AdmonitionProps {
        type: "warning" | "note" | "caution";
        children?: ComponentChildren;
        className?: string;
        style?: Css;
    }
    export const Admonition: FunctionComponent<AdmonitionProps>;

    export interface ButtonProps {
        text: string;
        name?: string;
        buttonRef?: RefObject<HTMLButtonElement>;
        className?: string;
        icon?: string;
        keyboardShortcut?: string;
        onClick?: () => void;
        kind?: "primary" | "secondary" | "lowProfile";
        disabled?: boolean;
        size?: "normal" | "small" | "micro";
        style?: Css;
        triggerCommand?: Cmd;
        title?: string;
    }
    export const Button: FunctionComponent<ButtonProps>;

    export interface CKEditorApi {
        focus(): void;
        setText(text: string): void;
    }
    export interface CKEditorProps {
        apiRef: RefObject<CKEditorApi | undefined>;
        currentValue?: string;
        className: string;
        tabIndex?: number;
        config: unknown;
        editor: unknown;
        disableNewlines?: boolean;
        disableSpellcheck?: boolean;
        onChange?: (newValue?: string) => void;
        onClick?: (e: MouseEvent, pos?: unknown) => void;
        onKeyDown?: (e: KeyboardEvent) => void;
        onBlur?: () => void;
        onInitialized?: (editorInstance: unknown) => void;
    }
    export const CKEditor: FunctionComponent<CKEditorProps>;

    export interface CollapsibleProps {
        title: string;
        children?: ComponentChildren;
        initiallyExpanded?: boolean;
        className?: string;
    }
    export const Collapsible: FunctionComponent<CollapsibleProps>;

    export interface DropdownProps {
        id?: string;
        className?: string;
        buttonClassName?: string;
        buttonProps?: Record<string, unknown>;
        isStatic?: boolean;
        children?: ComponentChildren;
        title?: string;
        dropdownContainerStyle?: Css;
        dropdownContainerClassName?: string;
        dropdownContainerRef?: RefObject<HTMLDivElement | null>;
        hideToggleArrow?: boolean;
        iconAction?: boolean;
        noSelectButtonStyle?: boolean;
        noDropdownListStyle?: boolean;
        disabled?: boolean;
        text?: ComponentChildren;
        forceShown?: boolean;
        onShown?: () => void;
        onHidden?: () => void;
        dropdownOptions?: Record<string, unknown>;
        dropdownRef?: RefObject<unknown>;
        titlePosition?: "top" | "right" | "bottom" | "left";
        titleOptions?: Record<string, unknown>;
        mobileBackdrop?: boolean;
    }
    export const Dropdown: FunctionComponent<DropdownProps>;

    export interface FormCheckboxProps {
        name?: string;
        label: ComponentChildren;
        hint?: string;
        currentValue: boolean;
        disabled?: boolean;
        onChange(newValue: boolean): void;
        containerStyle?: Css;
    }
    export const FormCheckbox: FunctionComponent<FormCheckboxProps>;

    export interface FormDropdownListProps<T> extends Omit<DropdownProps, "children"> {
        values: T[];
        keyProperty: keyof T;
        titleProperty: keyof T;
        titleSuffixProperty?: keyof T;
        descriptionProperty?: keyof T;
        currentValue: string;
        onChange(newValue: string): void;
    }
    export function FormDropdownList<T>(props: FormDropdownListProps<T>): VNode<any>;

    export const FormFileUploadButton: FunctionComponent<Omit<ButtonProps, "onClick"> & { onChange: (files: FileList | null) => void }>;
    export const FormFileUploadActionButton: FunctionComponent<Omit<ActionButtonProps, "onClick"> & { onChange: (files: FileList | null) => void }>;

    export interface FormGroupProps {
        name: string;
        labelRef?: RefObject<HTMLLabelElement>;
        label?: string;
        title?: string;
        className?: string;
        error?: string;
        children: VNode<any>;
        description?: ComponentChildren;
        disabled?: boolean;
        style?: Css;
    }
    export const FormGroup: FunctionComponent<FormGroupProps>;

    export interface FormListItemProps {
        children?: ComponentChildren;
        icon?: string;
        value?: string;
        title?: string;
        active?: boolean;
        badges?: unknown[];
        disabled?: boolean;
        disabledTooltip?: string;
        checked?: boolean | null;
        selected?: boolean;
        container?: boolean;
        onClick?: (e: MouseEvent) => void;
        triggerCommand?: Cmd;
        description?: string;
        className?: string;
        rtl?: boolean;
        postContent?: ComponentChildren;
        itemRef?: RefObject<HTMLLIElement>;
    }
    export const FormListItem: FunctionComponent<FormListItemProps>;

    export const FormDropdownDivider: FunctionComponent<{}>;

    export interface FormDropdownSubmenuProps {
        icon: string;
        title: ComponentChildren;
        children?: ComponentChildren;
        onDropdownToggleClicked?: () => void;
        dropStart?: boolean;
    }
    export const FormDropdownSubmenu: FunctionComponent<FormDropdownSubmenuProps>;

    export interface FormRadioGroupProps {
        name: string;
        currentValue?: string;
        values: ({ value: string; label: ComponentChildren; inlineDescription?: ComponentChildren } | false)[];
        onChange(newValue: string): void;
    }
    export const FormRadioGroup: FunctionComponent<FormRadioGroupProps>;

    export const FormText: FunctionComponent<{ children?: ComponentChildren }>;

    export interface FormTextAreaProps {
        id?: string;
        currentValue: string;
        onChange?(newValue: string): void;
        onBlur?(newValue: string): void;
        inputRef?: RefObject<HTMLTextAreaElement>;
        className?: string;
        placeholder?: string;
        rows?: number;
        disabled?: boolean;
        readOnly?: boolean;
    }
    export const FormTextArea: FunctionComponent<FormTextAreaProps>;

    export interface FormTextBoxProps {
        id?: string;
        currentValue?: string;
        onChange?(newValue: string, validity: ValidityState): void;
        onBlur?(newValue: string): void;
        inputRef?: RefObject<HTMLInputElement>;
        type?: string;
        className?: string;
        placeholder?: string;
        disabled?: boolean;
        readOnly?: boolean;
        autoFocus?: boolean;
        name?: string;
    }
    export const FormTextBox: FunctionComponent<FormTextBoxProps>;

    export interface FormToggleProps {
        currentValue: boolean | null;
        onChange(newValue: boolean): void;
        switchOnName?: string;
        switchOnTooltip?: string;
        switchOffName?: string;
        switchOffTooltip?: string;
        helpPage?: string;
        disabled?: boolean;
        afterName?: ComponentChildren;
        id?: string;
    }
    export const FormToggle: FunctionComponent<FormToggleProps>;

    export interface IconProps {
        icon?: string;
        className?: string;
        onClick?: (e: MouseEvent) => void;
        title?: string;
        style?: Css;
    }
    export const Icon: FunctionComponent<IconProps>;

    export interface LinkButtonProps {
        onClick?: () => void;
        text: ComponentChild;
        triggerCommand?: Cmd;
    }
    export const LinkButton: FunctionComponent<LinkButtonProps>;

    export const LoadingSpinner: FunctionComponent<{}>;

    export interface ModalProps {
        className: string;
        title?: ComponentChildren;
        customTitleBarButtons?: ({ title: string; iconClassName: string; onClick: (e: MouseEvent) => void } | null)[];
        size: "xl" | "lg" | "md" | "sm";
        children?: ComponentChildren;
        header?: ComponentChildren;
        footer?: ComponentChildren;
        footerStyle?: Css;
        footerAlignment?: "right" | "between";
        minWidth?: string;
        maxWidth?: number;
        zIndex?: number;
        scrollable?: boolean;
        onSubmit?: () => void;
        onShown?: () => void;
        onHidden: () => void;
        helpPageId?: string;
        modalRef?: RefObject<HTMLDivElement>;
        formRef?: RefObject<HTMLFormElement>;
        bodyStyle?: Css;
        show: boolean;
        stackable?: boolean;
        keepInDom?: boolean;
        noFocus?: boolean;
        sidebar?: ComponentChildren;
        isFullPageOnMobile?: boolean;
    }
    export const Modal: FunctionComponent<ModalProps>;

    export interface NoteAutocompleteProps {
        id?: string;
        inputRef?: RefObject<HTMLInputElement>;
        text?: string;
        placeholder?: string;
        container?: RefObject<HTMLElement | null | undefined>;
        containerStyle?: Css;
        opts?: Record<string, unknown>;
        onChange?: (suggestion: unknown) => void;
        onTextChange?: (text: string) => void;
        onKeyDown?: (e: KeyboardEvent) => void;
        onBlur?: (newValue: string) => void;
        noteIdChanged?: (noteId: string) => void;
        noteId?: string;
    }
    export const NoteAutocomplete: FunctionComponent<NoteAutocompleteProps>;

    export interface NoteLinkProps {
        className?: string;
        containerClassName?: string;
        notePath: string | string[];
        showNotePath?: boolean;
        showNoteIcon?: boolean;
        style?: Css;
        noPreview?: boolean;
        noTnLink?: boolean;
        highlightedTokens?: string[] | null;
        title?: string;
        viewScope?: unknown;
        noContextMenu?: boolean;
        onContextMenu?: (e: MouseEvent) => void;
    }
    export const NoteLink: FunctionComponent<NoteLinkProps>;

    export interface RawHtmlProps {
        className?: string;
        html?: string | HTMLElement;
        style?: Css;
        onClick?: (e: MouseEvent) => void;
        tabindex?: number;
        dir?: string;
        containerRef?: RefObject<HTMLSpanElement>;
    }
    export const RawHtml: FunctionComponent<RawHtmlProps>;

    export interface SliderProps {
        value: number;
        onChange(newValue: number): void;
        min?: number;
        max?: number;
        step?: number;
        title?: string;
    }
    export const Slider: FunctionComponent<SliderProps>;

    export interface RightPanelWidgetProps {
        id: string;
        title: string;
        children?: ComponentChildren;
        buttons?: ComponentChildren;
        containerRef?: RefObject<HTMLDivElement>;
        contextMenuItems?: unknown[];
        grow?: boolean;
    }
    export const RightPanelWidget: FunctionComponent<RightPanelWidgetProps>;
}

declare module "trilium:api" {
    const api: typeof globalThis.api;
    export default api;
}
`;
