import { DEFAULT_TASK_STATES, DONE_STATE_NAME, isAnchorState, NONE_STATE_NAME, type TaskStateDef } from "@triliumnext/commons";
import { Tooltip } from "bootstrap";
import { Command, getEnvKeystrokeText, ListEditing, Plugin, TodoList, type Editor, type ModelElement, type ViewElement } from "ckeditor5";

import { onTodoRowSplit } from "../todo_list_uncheck_on_enter.js";

export const TASK_STATE_ATTRIBUTE = "taskState";
const TODO_LIST_CHECKED_ATTRIBUTE = "todoListChecked";

/**
 * The ordered task states. Includes the built-in `none`/`done` anchors — those
 * are never written as `data-trilium-task-state`; they map to the native checkbox.
 */
export function getConfiguredTaskStates(editor: Editor): TaskStateDef[] {
    const states = editor.config.get("taskStates") as TaskStateDef[] | undefined;
    return states && states.length ? states : DEFAULT_TASK_STATES;
}

/**
 * The states surfaced in the toolbar and keyboard cycle — configured states
 * minus hidden ones. Hidden states still round-trip and keep their CSS.
 */
export function getActiveTaskStates(editor: Editor): TaskStateDef[] {
    return getConfiguredTaskStates(editor).filter((state) => !state.isHidden);
}

export default class TodoListMultistateEditing extends Plugin {

    static get requires() {
        return [TodoList, ListEditing] as const;
    }

    /**
     * Checkboxes that currently have a tooltip attached, mapped to the task state
     * baked into their tooltip title. Used to dispose stale tooltips on detached
     * checkboxes AND to refresh a tooltip when its checkbox's state changes.
     */
    private readonly _checkboxTooltips = new Map<HTMLInputElement, string | null>();

    /**
     * The checkbox whose tooltip is currently force-shown because the caret is in
     * its todo item. Tracked so a follow-up selection change can `hide()` the
     * previous tooltip before `show()`ing the next, and so a render that recreates
     * the input can re-attach + re-show without a visible gap (same pattern as
     * {@link CollapsibleEditing#registerSummaryTooltips}).
     */
    private _caretCheckbox: HTMLInputElement | null = null;

    init() {
        const editor = this.editor;
        const states = getConfiguredTaskStates(editor);
        const stateByName = new Map(states.map((state) => [state.name, state]));
        const translate = (editor.config.get("translate") as ((key: string, params?: Record<string, unknown>) => string) | undefined)
            ?? ((key: string) => key);

        editor.model.schema.extend("$block", {allowAttributes: TASK_STATE_ATTRIBUTE});

        editor.commands.add("setTaskState", new SetTaskStateCommand(editor));

        editor.keystrokes.set("Ctrl+Shift+Enter", (_data, cancel) => {
            const command = editor.commands.get("setTaskState");
            if (!command?.isEnabled) {
                return;
            }
            const cycle = getActiveTaskStates(editor).map((state) => state.name);
            const current = (command.value as string | null) ?? NONE_STATE_NAME;
            const idx = cycle.indexOf(current);
            const next = cycle[(idx + 1) % cycle.length];
            editor.execute("setTaskState", {state: next});
            cancel();
        });

        const listEditing = editor.plugins.get(ListEditing);
        listEditing.registerDowncastStrategy({
            scope: "item",
            attributeName: TASK_STATE_ATTRIBUTE,
            setAttributeOnDowncast(writer, value, element, options) {
                // Customizable states carry `data-trilium-task-state`; none/done are native.
                // Unrecognized states are preserved so they survive a state-config change.
                if (typeof value === "string" && value !== "" && !isAnchorState(value)) {
                    writer.setAttribute("data-trilium-task-state", value, element);
                } else {
                    writer.removeAttribute("data-trilium-task-state", element);
                }

                // Editing-only class for states missing from the current config. Added on
                // the editing pipeline only, so it is never written into the saved content.
                const isUnknown = typeof value === "string" && value !== ""
                    && !isAnchorState(value) && !stateByName.has(value);
                if (isUnknown && !options?.dataPipeline) {
                    writer.addClass("tn-unknown-task-state", element);
                } else {
                    writer.removeClass("tn-unknown-task-state", element);
                }
            }
        });

        editor.conversion.for("upcast").attributeToAttribute({
            view: {key: "data-trilium-task-state"},
            model: {
                key: TASK_STATE_ATTRIBUTE,
                value: (viewElement: ViewElement) => {
                    const value = viewElement.getAttribute("data-trilium-task-state");
                    return typeof value === "string" && value !== "" && !isAnchorState(value)
                        ? value
                        : null;
                }
            }
        });

        this.listenTo(editor.editing.view, "render", () => {
            const domRoot = editor.editing.view.getDomRoot();
            if (!domRoot) {
                return;
            }
            // CKEditor recreates the checkbox element when a todo item reconverts
            // (e.g. on click); dispose tooltips left on the detached old checkboxes.
            for (const input of this._checkboxTooltips.keys()) {
                if (!input.isConnected) {
                    Tooltip.getInstance(input)?.dispose();
                    this._checkboxTooltips.delete(input);
                    if (this._caretCheckbox === input) {
                        this._caretCheckbox = null;
                    }
                }
            }
            // Track inputs whose tooltip was (re)created this render so the caret
            // sync can re-`show()` them even when the caret target didn't change.
            const recreated = new Set<HTMLInputElement>();
            for (const input of domRoot.querySelectorAll<HTMLInputElement>(".todo-list__label input[type=\"checkbox\"]")) {
                const currentState = readTaskState(input);
                // Skip if the tooltip is already up to date for this state.
                if (Tooltip.getInstance(input) && this._checkboxTooltips.get(input) === currentState) {
                    continue;
                }
                const wasTracked = this._checkboxTooltips.has(input);
                Tooltip.getInstance(input)?.dispose();
                const title = buildTooltipTitle(input, currentState, stateByName, translate);
                new Tooltip(input, {
                    title,
                    html: true,
                    // Bootstrap's default sanitizer strips `data-*` attributes, which
                    // the tooltip's state-icon span relies on to render the correct
                    // colour/glyph. The HTML is built from translations we control
                    // (with user values interpolated through i18next's default
                    // escaping) so disabling the sanitizer is safe here.
                    sanitize: false,
                    // Manual trigger — Bootstrap's default `hover focus` fires
                    // `_leave` on stray focusout events (the checkbox has
                    // `tabindex="-1"` and can receive programmatic focus during
                    // reconversion), which raced our caret-driven `show()` and
                    // dismissed the tooltip. Everything visibility-related is
                    // driven from `_syncCaretTooltip` and the hover listeners
                    // attached in `_attachHoverListeners`.
                    trigger: "manual",
                    customClass: "text-editor-content-tooltip"
                });
                this._checkboxTooltips.set(input, currentState);
                recreated.add(input);
                // Attach hover listeners once per input — they use dynamic
                // `Tooltip.getInstance(input)` so they keep working after a
                // state-change refresh replaces the tooltip on the same element.
                if (!wasTracked) {
                    this._attachHoverListeners(input);
                }
            }
            // Re-derive the caret target from the model. Covers three cases:
            //  a) same input, same tooltip — nothing to do;
            //  b) same input, tooltip recreated (state change on the item) —
            //     force `show()` so the hint stays up;
            //  c) input recreated (Ctrl+Shift+Enter across isCompleted boundary)
            //     — old ref was nulled in the reaper above; re-attach to the
            //     new input and `show()` its fresh tooltip.
            this._syncCaretTooltip(recreated);
        });

        // Keyboard-only navigation into an <li> doesn't move DOM focus (the editable
        // root keeps it), so Bootstrap's focus trigger never fires. Drive the tooltip
        // manually from the model selection so keyboard users see the hint too.
        this.listenTo(editor.model.document.selection, "change:range", () => {
            this._syncCaretTooltip();
        });

        // A new row split off with Enter inherits the previous row's `taskState` (writer.split
        // copies block attributes). Drop it so each new task starts in the plain "none" state.
        // Without this, `TodoListUncheckOnEnter` clears the new row's checkbox but the inherited
        // `taskState` survives, leaving an inconsistent row (e.g. a completed "review" state with
        // an unchecked box) and carrying #10084 over to custom states. The post-fixer below can't
        // catch it: it reacts to taskState *changes*, but on a split the attribute arrives as part
        // of the inserted node, not as a diff. `TodoListUncheckOnEnter` clears the companion
        // `todoListChecked` via the same seam.
        onTodoRowSplit(this, (writer, block) => {
            writer.removeAttribute(TASK_STATE_ATTRIBUTE, block);
        });

        editor.model.document.registerPostFixer((writer) => {
            const differ = editor.model.document.differ;
            const stateChanged = new Set<ModelElement>();
            const checkedChanged = new Set<ModelElement>();

            for (const entry of differ.getChanges()) {
                if (entry.type !== "attribute") {
                    continue;
                }
                const node = entry.range.start.nodeAfter;
                if (!node || !node.is("element")) {
                    continue;
                }
                if (node.getAttribute("listType") !== "todo") {
                    continue;
                }
                if (entry.attributeKey === TASK_STATE_ATTRIBUTE) {
                    stateChanged.add(node as ModelElement);
                } else if (entry.attributeKey === TODO_LIST_CHECKED_ATTRIBUTE) {
                    checkedChanged.add(node as ModelElement);
                }
            }

            let changed = false;

            // A customizable state forces the checkbox to its `isCompleted`.
            for (const el of stateChanged) {
                const stateName = el.getAttribute(TASK_STATE_ATTRIBUTE);
                const state = typeof stateName === "string" ? stateByName.get(stateName) : undefined;
                if (!state) {
                    // State cleared — the command already set the native checkbox.
                    continue;
                }
                if (!!el.getAttribute(TODO_LIST_CHECKED_ATTRIBUTE) !== state.isCompleted) {
                    writer.setAttribute(TODO_LIST_CHECKED_ATTRIBUTE, state.isCompleted, el);
                    changed = true;
                }
            }

            // Toggling the native checkbox drops any special state (back to native none/done).
            for (const el of checkedChanged) {
                if (stateChanged.has(el)) {
                    continue;
                }
                if (el.getAttribute(TASK_STATE_ATTRIBUTE) !== undefined) {
                    writer.removeAttribute(TASK_STATE_ATTRIBUTE, el);
                    changed = true;
                }
            }

            return changed;
        });
    }

    override destroy() {
        for (const input of this._checkboxTooltips.keys()) {
            Tooltip.getInstance(input)?.dispose();
        }
        this._checkboxTooltips.clear();
        this._caretCheckbox = null;
        super.destroy();
    }

    /**
     * Attach hover triggers on a freshly-tracked checkbox. Both handlers no-op
     * when the caret is already inside the same todo item — the caret-driven
     * flow already owns the tooltip's visibility there, and letting `show()` /
     * `hide()` run again produced a rebuild-then-tear-down flicker.
     * `Tooltip.getInstance(input)` is resolved lazily so the same closures keep
     * working after a state-change refresh replaces the tooltip on the same
     * DOM element.
     */
    private _attachHoverListeners(input: HTMLInputElement): void {
        const isCaretInThisItem = () => {
            const itemId = input.closest<HTMLElement>("li")?.getAttribute("data-list-item-id");
            return !!itemId && this._isCaretInsideItem(itemId);
        };
        input.addEventListener("mouseenter", () => {
            if (isCaretInThisItem()) {
                return;
            }
            Tooltip.getInstance(input)?.show();
        });
        input.addEventListener("mouseleave", () => {
            if (isCaretInThisItem()) {
                return;
            }
            Tooltip.getInstance(input)?.hide();
        });
    }

    /**
     * Reconcile {@link _caretCheckbox} against the current model caret target and
     * drive the corresponding Bootstrap tooltip's visibility. Called from the
     * selection listener (target may change) AND from the render listener
     * (tooltips may have been (re)created for the current target).
     *
     * `recreated` is the set of inputs whose tooltip was just replaced this render;
     * when the caret target is in that set, `show()` is forced even if the target
     * itself didn't change, so a state-change render keeps the hint visible.
     */
    private _syncCaretTooltip(recreated?: ReadonlySet<HTMLInputElement>): void {
        const target = this._findCaretCheckbox();
        const targetChanged = this._caretCheckbox !== target;
        if (targetChanged && this._caretCheckbox) {
            Tooltip.getInstance(this._caretCheckbox)?.hide();
        }
        this._caretCheckbox = target;
        if (target && (targetChanged || recreated?.has(target))) {
            Tooltip.getInstance(target)?.show();
        }
    }

    /**
     * True when the caret's model position sits inside a list item whose
     * `listItemId` matches. Used by the mouseleave guard to keep the tooltip up
     * while the caret is in the hovered item, without depending on DOM identity.
     */
    private _isCaretInsideItem(itemId: string): boolean {
        const position = this.editor.model.document.selection.getFirstPosition();
        let candidate = position?.parent ?? null;
        while (candidate) {
            if (candidate.is("element") && candidate.getAttribute("listItemId") === itemId) {
                return true;
            }
            candidate = candidate.parent;
        }
        return false;
    }

    /**
     * The <input> DOM checkbox of the todo item the caret is currently inside, or
     * `null` when the caret isn't inside a todo item. Walks up the model to find
     * an ancestor block with `listType == "todo"`, then queries the editing DOM
     * for the matching <li data-list-item-id="…">.
     */
    private _findCaretCheckbox(): HTMLInputElement | null {
        const position = this.editor.model.document.selection.getFirstPosition();
        let node: ModelElement | null = null;
        let candidate = position?.parent ?? null;
        while (candidate) {
            if (candidate.is("element") && candidate.getAttribute("listType") === "todo") {
                node = candidate as ModelElement;
                break;
            }
            candidate = candidate.parent;
        }
        if (!node) {
            return null;
        }
        const itemId = node.getAttribute("listItemId");
        if (typeof itemId !== "string" || !itemId) {
            return null;
        }
        const domRoot = this.editor.editing.view.getDomRoot();
        return domRoot?.querySelector<HTMLInputElement>(
            `li[data-list-item-id="${CSS.escape(itemId)}"] .todo-list__label input[type="checkbox"]`
        ) ?? null;
    }

}

type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

/**
 * The task state applied to the todo item that owns the given checkbox. Anchor
 * states (`none`/`done`) never carry a `data-trilium-task-state`, so this
 * returns `null` for them.
 *
 * The lookup must be scoped to the *nearest* <li>, not the nearest <li> that
 * happens to carry the attribute — in nested todo lists the DOM is
 * `<li outer data-trilium-task-state="doing">…<ul><li inner>…</li></ul></li>`,
 * so a filtered `closest("li[data-trilium-task-state]")` on the inner
 * checkbox walks straight past its own (unattributed) <li> and lands on the
 * outer one, wrongly attributing the parent's state to the inner item.
 */
function readTaskState(input: HTMLInputElement): string | null {
    const li = input.closest<HTMLElement>("li");
    return li?.getAttribute("data-trilium-task-state") ?? null;
}

/**
 * Build the checkbox tooltip HTML. The base body (right-click hint + keyboard
 * shortcut) is always present. For a non-anchor state, a "Task state: …" line
 * is prepended. The state-line HTML is assembled here via the DOM API rather
 * than in the translation, so translations stay plain text.
 *  - configured state → the state's own checkbox glyph + bold name;
 *  - unknown state (attribute set but no matching definition) → the raw name
 *    followed by a translated "(missing definition)" note.
 */
function buildTooltipTitle(
    input: HTMLInputElement,
    state: string | null,
    stateByName: Map<string, TaskStateDef>,
    translate: TranslateFn
): string {
    const body = translate("text-editor.checkbox-tooltip", {
        shortcut: getEnvKeystrokeText("Ctrl+Shift+Enter")
    }).replace(/\n/g, "<br>");
    if (!state) {
        return body;
    }
    const stateDef = stateByName.get(state);
    const suffix = stateDef
        ? buildKnownStateSuffixHtml(input.ownerDocument, state, stateDef.title || stateDef.name)
        : buildUnknownStateSuffixHtml(
            input.ownerDocument,
            state,
            translate("text-editor.checkbox-tooltip-state-unknown-suffix")
        );
    const label = translate("text-editor.checkbox-tooltip-state-label");
    // The status line is a block-level <div> so it forces a line break before
    // the body and the CSS `margin-bottom: 8px` cleanly separates the two.
    return `<div class="tn-task-tooltip-state">${label} ${suffix}</div>${body}`;
}

/**
 * "<mini-checkbox> <strong>Name</strong>" — the icon and name flow inline
 * after the "Task state:" label. Built via the DOM API so the state name
 * is text-escaped by the browser rather than by hand.
 */
function buildKnownStateSuffixHtml(doc: Document, state: string, name: string): string {
    const strong = doc.createElement("strong");
    strong.textContent = name;
    return `${buildStateIconElement(doc, state).outerHTML} ${strong.outerHTML}`;
}

/** "wontdo (missing definition)" — text-escaped via textContent. */
function buildUnknownStateSuffixHtml(doc: Document, state: string, missingSuffix: string): string {
    const span = doc.createElement("span");
    span.textContent = `${state} ${missingSuffix}`;
    return span.outerHTML;
}

/**
 * A miniature checkbox glyph the tooltip can inline. `.tn-task-checkbox` provides
 * the box + glyph rendering but needs an inline-block context (the class itself
 * carries only width/height/position). The `.tn-task-checkbox-inline` wrapper
 * gives it that slot so it renders correctly inside a text tooltip.
 */
function buildStateIconElement(doc: Document, state: string): HTMLSpanElement {
    const wrapper = doc.createElement("span");
    wrapper.className = "tn-task-checkbox-inline";
    const inner = doc.createElement("span");
    inner.className = "tn-task-checkbox";
    inner.setAttribute("data-trilium-task-state", state);
    wrapper.appendChild(inner);
    return wrapper;
}

class SetTaskStateCommand extends Command {

    declare public value: string | null;

    refresh() {
        const block = this._getTodoBlock();
        this.isEnabled = !!block;
        if (!block) {
            this.value = null;
            return;
        }
        const stored = block.getAttribute(TASK_STATE_ATTRIBUTE);
        if (typeof stored === "string") {
            this.value = stored;
        } else {
            this.value = block.getAttribute(TODO_LIST_CHECKED_ATTRIBUTE) ? DONE_STATE_NAME : NONE_STATE_NAME;
        }
    }

    execute(options: {state: string | null}) {
        const model = this.editor.model;
        const state = options.state ?? NONE_STATE_NAME;
        model.change((writer) => {
            for (const block of model.document.selection.getSelectedBlocks()) {
                if (block.getAttribute("listType") !== "todo") {
                    continue;
                }
                if (state === NONE_STATE_NAME) {
                    writer.removeAttribute(TASK_STATE_ATTRIBUTE, block);
                    writer.setAttribute(TODO_LIST_CHECKED_ATTRIBUTE, false, block);
                } else if (state === DONE_STATE_NAME) {
                    writer.removeAttribute(TASK_STATE_ATTRIBUTE, block);
                    writer.setAttribute(TODO_LIST_CHECKED_ATTRIBUTE, true, block);
                } else {
                    writer.setAttribute(TASK_STATE_ATTRIBUTE, state, block);
                }
            }
        });
    }

    private _getTodoBlock(): ModelElement | null {
        const position = this.editor.model.document.selection.getFirstPosition();
        const parent = position?.parent;
        if (!parent || !parent.is("element")) {
            return null;
        }
        return parent.getAttribute("listType") === "todo" ? (parent as ModelElement) : null;
    }

}
