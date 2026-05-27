import { Plugin, Enter, Delete, enableViewPlaceholder, getEnvKeystrokeText, type ViewDocumentEnterEvent, type ViewDocumentDeleteEvent, type ViewDocumentArrowKeyEvent } from "ckeditor5";
import { Tooltip } from "bootstrap";
import CollapsibleCommand from "./collapsiblecommand.js";

/**
 * Schema, conversion and key handling for collapsible blocks.
 *
 * Model:        <details><summary>title</summary>…blocks…</details>
 * Data view:    <details class="trilium-collapsible"><summary>…</summary>…</details>
 * Editing view: same, plus a custom arrow UIElement in the summary for toggling.
 *               The DOM `open` attribute is the source of truth for collapsed state
 *               and is intentionally not persisted in the model — everything loads
 *               collapsed; the insert command opens new blocks explicitly.
 */
export default class CollapsibleEditing extends Plugin {

    public static get pluginName() {
        return "CollapsibleEditing" as const;
    }

    public static get requires() {
        return [Enter, Delete] as const;
    }

    private _keydownListener?: (event: KeyboardEvent) => void;
    private _toggleListener?: (event: Event) => void;
    /** Summary DOM elements that currently have a Bootstrap tooltip attached. */
    private readonly _summaryTooltips = new Set<HTMLElement>();
    /** The summary tooltip we currently have force-shown because the caret is inside it. */
    private _caretShownTooltip?: HTMLElement;

    public init(): void {
        this.editor.commands.add("collapsible", new CollapsibleCommand(this.editor));
        this._registerSchema();
        this._registerConversion();
        this._registerKeyHandlers();
        this._registerClickHandler();
        this._registerDomListeners();
        this._registerPostFixers();
        this._registerSummaryTooltips();
    }

    public override destroy(): void {
        const domRoot = this.editor.editing.view.getDomRoot();
        if (domRoot) {
            if (this._keydownListener) domRoot.removeEventListener("keydown", this._keydownListener, true);
            if (this._toggleListener) domRoot.removeEventListener("toggle", this._toggleListener, true);
        }
        for (const summary of this._summaryTooltips) {
            Tooltip.getInstance(summary)?.dispose();
        }
        this._summaryTooltips.clear();
        super.destroy();
    }

    // -----------------------------------------------------------------
    // Schema & conversion
    // -----------------------------------------------------------------

    private _registerSchema() {
        const schema = this.editor.model.schema;
        schema.register("details", { inheritAllFrom: "$container" });
        schema.register("summary", {
            allowIn: "details",
            allowContentOf: "$block",
            // isBlock lets MoveBlockUpDownPlugin (and other block-level commands)
            // resolve a caret-in-summary to the enclosing <details> via its
            // walk-up-to-top-level-block logic.
            isBlock: true
        });
    }

    private _registerConversion() {
        const conversion = this.editor.conversion;
        const detailsView = (_m: any, { writer }: any) =>
            writer.createContainerElement("details", { class: "trilium-collapsible" });

        // <details>
        conversion.for("upcast").elementToElement({ view: "details", model: "details" });
        conversion.for("dataDowncast").elementToElement({ model: "details", view: detailsView });
        conversion.for("editingDowncast").elementToElement({ model: "details", view: detailsView });

        // <summary>
        conversion.for("upcast").elementToElement({ view: "summary", model: "summary" });
        conversion.for("dataDowncast").elementToElement({ model: "summary", view: "summary" });
        conversion.for("editingDowncast").elementToElement({
            model: "summary",
            view: (_m: any, { writer }: any) => this._createEditingSummary(writer)
        });
    }

    /**
     * Editing-view summary: a normal <summary> with a non-editable arrow UIElement
     * prepended. Clicking the arrow toggles the native <details>; the data view
     * doesn't include the arrow so it doesn't pollute saved HTML.
     */
    private _createEditingSummary(writer: any): any {
        const summary = writer.createContainerElement("summary");
        const arrow = writer.createUIElement("span", { class: "trilium-collapsible-arrow" }, function(this: any, domDocument: any) {
            const span: HTMLElement = this.toDomElement(domDocument);
            // mousedown preventDefault keeps the browser from placing a caret
            // inside the non-editable UI element.
            span.addEventListener("mousedown", (e: Event) => e.preventDefault());
            span.addEventListener("click", (e: Event) => {
                e.stopPropagation();
                e.preventDefault();
                const details = span.closest("details");
                if (details) details.open = !details.open;
            });
            return span;
        });
        writer.insert(writer.createPositionAt(summary, 0), arrow);
        // "Title" placeholder shown while the summary is empty. UIElements like the
        // arrow above don't count as content for placeholder purposes.
        const translate = (this.editor.config.get("translate") as ((key: string, params?: Record<string, unknown>) => string) | undefined)
            ?? ((key: string) => key);
        enableViewPlaceholder({
            view: this.editor.editing.view,
            element: summary,
            text: translate("text-editor.collapsible-title-placeholder"),
            keepOnFocus: true
        });
        return summary;
    }

    // -----------------------------------------------------------------
    // DOM/model bridge helpers
    // -----------------------------------------------------------------

    private _getDom<T extends Element = HTMLElement>(model: any): T | null {
        const view = this.editor.editing.mapper.toViewElement(model);
        const dom = view ? this.editor.editing.view.domConverter.viewToDom(view) : null;
        return dom instanceof Element ? (dom as unknown as T) : null;
    }

    /** True if the <details> is currently expanded (or no DOM mapping yet). */
    private _isDetailsOpen(model: any): boolean {
        const dom = this._getDom<HTMLDetailsElement>(model);
        return !dom || dom.open;
    }

    /** Toggle the DOM `open` attribute directly (the source of truth in this plugin). */
    private _setDetailsOpen(model: any, open: boolean) {
        const dom = this._getDom<HTMLDetailsElement>(model);
        if (dom) dom.open = open;
    }

    /** Is the caret on the first ("top") or last ("bottom") visual line of `dom`? */
    private _caretAtVisualEdge(dom: HTMLElement, edge: "top" | "bottom"): boolean {
        const win = dom.ownerDocument.defaultView;
        const sel = win?.getSelection();
        if (!sel || sel.rangeCount === 0) return true;
        const caret = sel.getRangeAt(0).getBoundingClientRect();
        const box = dom.getBoundingClientRect();
        const lineHeight = parseFloat(win!.getComputedStyle(dom).lineHeight) || 16;
        return edge === "top"
            ? caret.top < box.top + lineHeight / 2
            : caret.bottom > box.bottom - lineHeight / 2;
    }

    /** Insert a new empty paragraph at `position` and place the caret in it. */
    private _insertParagraphAt(writer: any, position: any): any {
        const p = writer.createElement("paragraph");
        writer.insert(p, position);
        writer.setSelection(p, 0);
        return p;
    }

    // -----------------------------------------------------------------
    // View-event key handlers (Enter, Delete, ArrowUp)
    // -----------------------------------------------------------------

    private _registerKeyHandlers() {
        const viewDocument = this.editor.editing.view.document;
        this.listenTo<ViewDocumentEnterEvent>(viewDocument, "enter",
            (evt, data) => this._onEnterInSummary(evt, data), { context: "summary" });
        this.listenTo<ViewDocumentEnterEvent>(viewDocument, "enter",
            (evt, data) => this._onEnterInBody(evt, data));
        this.listenTo<ViewDocumentArrowKeyEvent>(viewDocument, "arrowKey",
            (evt, data) => this._onUpArrow(evt, data));
        this.listenTo<ViewDocumentDeleteEvent>(viewDocument, "delete",
            (evt, data) => this._onDeleteAdjacentDetails(evt, data));
        this.listenTo<ViewDocumentDeleteEvent>(viewDocument, "delete",
            (evt, data) => this._onBackspaceInEmptySummary(evt, data), { context: "summary" });
    }

    /**
     * Enter inside a summary:
     *   - at start of title  → blank paragraph before the collapsible
     *   - at end of title    → expanded: empty paragraph at start of body
     *                          collapsed: blank paragraph after the collapsible
     *   - anywhere else      → split the title, right side becomes the first body
     *                          block (expand if collapsed)
     */
    private _onEnterInSummary(evt: any, data: any) {
        const editor = this.editor;
        const model = editor.model;
        const selection = model.document.selection;

        const summary = selection.getFirstPosition()?.findAncestor("summary");
        if (!summary) return;

        // Titles are single-line: always swallow Enter so it never inserts a newline
        // — even when there's an active selection inside the summary (native Enter
        // would otherwise split the summary and produce an invalid structure).
        data.preventDefault();
        evt.stop();

        const details = summary.parent;
        if (!details || !details.is("element", "details")) return;

        // If the title is currently collapsed and we'll need to expand it (middle-
        // of-title split), do it now — before model.change runs and the hidden-body
        // post-fixer gets a chance to snap the caret out of the new body paragraph.
        const willSplit = !selection.isCollapsed
            ? false  // selection will be deleted first, then the new collapsed position determines branch
            : !selection.getLastPosition()!.isAtStart && !selection.getLastPosition()!.isAtEnd;
        if (willSplit && !this._isDetailsOpen(details)) {
            this._setDetailsOpen(details, true);
        }

        model.change(writer => {
            // Drop any non-collapsed selection so we operate on a single position.
            if (!selection.isCollapsed) {
                model.deleteContent(selection);
            }
            const position = selection.getLastPosition()!;

            if (position.isAtStart) {
                this._insertParagraphAt(writer, writer.createPositionBefore(details));
                return;
            }

            if (position.isAtEnd) {
                const pos = this._isDetailsOpen(details)
                    ? writer.createPositionAfter(summary)
                    : writer.createPositionAfter(details);
                this._insertParagraphAt(writer, pos);
                return;
            }

            // Middle of title: split. If we entered this branch via the selection-
            // delete path (rather than `willSplit` above), expand now too.
            if (!this._isDetailsOpen(details)) {
                this._setDetailsOpen(details, true);
            }
            const rightRange = writer.createRange(
                writer.createPositionAt(summary, position.offset),
                writer.createPositionAt(summary, "end")
            );
            const p = writer.createElement("paragraph");
            writer.insert(p, summary, "after");
            writer.move(rightRange, writer.createPositionAt(p, 0));
            writer.setSelection(p, 0);
        });
    }

    /**
     * Enter in an empty trailing paragraph of the body exits the collapsible
     * (text + Enter + Enter → out — same convention as blockquote).
     */
    private _onEnterInBody(evt: any, data: any) {
        const editor = this.editor;
        const selection = editor.model.document.selection;
        if (!selection.isCollapsed) return;

        const parent = selection.getLastPosition()?.parent;
        if (!parent || !parent.is("element") || parent.is("element", "summary")) return;
        if (!parent.isEmpty || parent.nextSibling) return;

        const details = parent.parent;
        if (!details || !details.is("element", "details")) return;

        data.preventDefault();
        evt.stop();

        editor.model.change(writer => {
            writer.remove(parent);
            const after = details.nextSibling;
            if (after?.is("element", "paragraph")) {
                writer.setSelection(after, 0);
            } else {
                this._insertParagraphAt(writer, writer.createPositionAfter(details));
            }
        });
    }

    /**
     * Up arrow:
     *   - from inside a summary whose details has a previous-sibling details
     *     → jump into the previous details (its last block if open, summary if closed)
     *   - from the start of any other block whose previous sibling is a details
     *     → jump into the previous details (same rules)
     * Multi-line summary navigation is left to the browser via the visual-edge guard.
     */
    private _onUpArrow(evt: any, data: any) {
        const selection = this.editor.model.document.selection;
        if (data.keyCode !== 38 || data.shiftKey || !selection.isCollapsed) return;

        const position = selection.getFirstPosition();
        if (!position) return;

        const summary = position.findAncestor("summary");
        if (summary) {
            const details = summary.parent;
            if (!details?.is("element", "details")) return;
            const dom = this._getDom<HTMLElement>(summary);
            if (dom && !this._caretAtVisualEdge(dom, "top")) return;
            const prev = details.previousSibling;
            if (!prev?.is("element", "details")) return;
            this._jumpUpInto(prev, /* atOffsetZeroIfOpen */ false, evt, data);
            return;
        }

        const block = position.parent;
        if (!block || !block.is("element") || !position.isAtStart) return;
        const prev = block.previousSibling;
        if (!prev?.is("element", "details")) return;
        this._jumpUpInto(prev, /* atOffsetZeroIfOpen */ true, evt, data);
    }

    private _jumpUpInto(details: any, atOffsetZeroIfOpen: boolean, evt: any, data: any) {
        const open = this._isDetailsOpen(details);
        const target = open
            ? details.getChild(details.childCount - 1)
            : details.getChild(0);
        if (!target?.is("element")) return;
        const offset: number | "end" = open && atOffsetZeroIfOpen ? 0 : "end";
        this.editor.model.change(writer => writer.setSelection(target, offset));
        data.preventDefault();
        evt.stop();
    }

    /**
     * Two-step delete next to a <details> (matches CKEditor's widget/object pattern):
     *   1st press: select the whole <details> so the user sees what's about to go.
     *   2nd press: with the details selected, default delete removes it.
     */
    private _onDeleteAdjacentDetails(evt: any, data: any) {
        const selection = this.editor.model.document.selection;
        // 2nd press: a <details> is already selected; let CKEditor's default delete
        // remove it (more reliable than us calling writer.remove here).
        if (selection.getSelectedElement()?.is("element", "details")) return;

        if (!selection.isCollapsed) return;
        const position = selection.getFirstPosition();
        if (!position) return;
        const adjacent = data.direction === "forward" ? position.nodeAfter : position.nodeBefore;
        if (!adjacent || !adjacent.is("element", "details")) return;

        this.editor.model.change(writer => writer.setSelection(adjacent, "on"));
        data.preventDefault();
        evt.stop();
    }

    /** Backspace at start of an empty summary unwraps the collapsible. */
    private _onBackspaceInEmptySummary(evt: any, data: any) {
        const selection = this.editor.model.document.selection;
        if (data.direction !== "backward" || !selection.isCollapsed) return;
        const summary = selection.getLastPosition()?.findAncestor("summary");
        if (!summary || !summary.isEmpty) return;
        const details = summary.parent;
        if (!details || !details.is("element", "details")) return;
        data.preventDefault();
        evt.stop();
        this.editor.model.change(writer => writer.unwrap(details));
    }

    // -----------------------------------------------------------------
    // Click handler
    // -----------------------------------------------------------------

    /**
     * Suppress the native click-to-toggle on <summary> in the editor — only the
     * custom arrow may change the open state. The data/published view keeps the
     * native marker and click-to-toggle behavior.
     *
     * Modifier-clicks (Ctrl/Cmd/Shift/Alt) pass through so Ctrl+click on a link
     * inside the title still opens it in a new tab, etc.
     */
    private _registerClickHandler() {
        this.listenTo(this.editor.editing.view.document, "click", (_evt, data: any) => {
            const domEvent = data.domEvent as MouseEvent | undefined;
            if (domEvent?.ctrlKey || domEvent?.metaKey || domEvent?.shiftKey || domEvent?.altKey) return;
            for (let node = data.target; node; node = node.parent) {
                if (node.is?.("element", "summary") && node.parent?.is("element", "details")) {
                    data.preventDefault();
                    return;
                }
            }
        });
    }

    // -----------------------------------------------------------------
    // DOM listeners (need DOM root; registered once the editor is ready)
    // -----------------------------------------------------------------

    private _registerDomListeners() {
        const editor = this.editor;
        editor.on("ready", () => {
            const domRoot = editor.editing.view.getDomRoot();
            if (!domRoot) return;
            // DOM-level keydown for Ctrl+Enter and ArrowDown. View-event listeners
            // are unreliable when the caret is inside attribute elements (links,
            // formatted text, …); DOM capture phase always fires.
            this._keydownListener = (event: KeyboardEvent) => this._onDomKeydown(event);
            // Move the caret out of a body that's about to be hidden by collapse.
            // (toggle does not bubble — capture phase.)
            this._toggleListener = (event: Event) => this._onDetailsToggle(event);
            domRoot.addEventListener("keydown", this._keydownListener, true);
            domRoot.addEventListener("toggle", this._toggleListener, true);
        });
    }

    private _onDomKeydown(event: KeyboardEvent) {
        const selection = this.editor.model.document.selection;

        // Ctrl+Enter (Cmd+Enter on Mac) inside a summary toggles the enclosing details.
        if (event.key === "Enter" && !event.shiftKey && !event.altKey && (event.ctrlKey || event.metaKey)) {
            const summary = selection.getFirstPosition()?.findAncestor("summary");
            const details = summary?.parent;
            if (!details?.is("element", "details")) return;
            const dom = this._getDom<HTMLDetailsElement>(details);
            if (!dom) return;
            dom.open = !dom.open;
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        // ArrowDown in a summary jumps into the body (or skips past a collapsed block).
        if (event.key === "ArrowDown" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
            const summary = selection.getFirstPosition()?.findAncestor("summary");
            if (!summary) return;
            const details = summary.parent;
            if (!details?.is("element", "details")) return;
            const dom = this._getDom<HTMLElement>(summary);
            if (dom && !this._caretAtVisualEdge(dom, "bottom")) return;
            const target = this._isDetailsOpen(details) ? summary.nextSibling : details.nextSibling;
            if (!target?.is("element")) return;
            this.editor.model.change(writer => writer.setSelection(target, 0));
            event.preventDefault();
            event.stopPropagation();
        }
    }

    private _onDetailsToggle(event: Event) {
        const editor = this.editor;
        const detailsDom = event.target as HTMLDetailsElement;
        if (detailsDom.tagName?.toLowerCase() !== "details") return;
        if (!detailsDom.classList.contains("trilium-collapsible")) return;
        if (detailsDom.open) return;

        const detailsView = editor.editing.view.domConverter.mapDomToView(detailsDom);
        const detailsModel = detailsView ? editor.editing.mapper.toModelElement(detailsView as any) : null;
        if (!detailsModel) return;

        const summary = detailsModel.getChild(0);
        if (!summary?.is("element", "summary")) return;

        const position = editor.model.document.selection.getFirstPosition();
        if (!position) return;

        // Already in the toggled block's own summary — caret is still visible.
        if (position.findAncestor("summary") === summary) return;

        // The caret only needs to move if it's inside the toggled details
        // (could be many levels deep — e.g. a nested collapsible's body or its
        // summary; both get hidden when the outer one collapses).
        let isInside = false;
        for (let node: any = position.parent; node; node = node.parent) {
            if (node === detailsModel) { isInside = true; break; }
        }
        if (!isInside) return;

        editor.model.change(writer => writer.setSelection(summary, "end"));
    }

    // -----------------------------------------------------------------
    // Summary tooltip (Bootstrap, screen-corner hint)
    // -----------------------------------------------------------------

    /**
     * Attach a Bootstrap tooltip to every <summary> DOM element so hovering or
     * focusing the title pops up a "click the arrow or press Ctrl+Enter" hint
     * in the screen corner (the same UX as the todo-list multistate plugin).
     */
    private _registerSummaryTooltips() {
        const editor = this.editor;
        const translate = (editor.config.get("translate") as ((key: string, params?: Record<string, unknown>) => string) | undefined)
            ?? ((key: string) => key);

        this.listenTo(editor.editing.view, "render", () => {
            const domRoot = editor.editing.view.getDomRoot();
            if (!domRoot) return;

            // Drop tooltips on summaries that CKEditor re-rendered out of the DOM.
            for (const summary of this._summaryTooltips) {
                if (!summary.isConnected) {
                    Tooltip.getInstance(summary)?.dispose();
                    this._summaryTooltips.delete(summary);
                    if (this._caretShownTooltip === summary) this._caretShownTooltip = undefined;
                }
            }

            for (const summary of domRoot.querySelectorAll<HTMLElement>("details.trilium-collapsible > summary")) {
                if (Tooltip.getInstance(summary)) continue;
                const title = translate("text-editor.collapsible-tooltip", {
                    shortcut: getEnvKeystrokeText("Ctrl+Enter")
                });
                new Tooltip(summary, { title, customClass: "text-editor-content-tooltip" });
                this._summaryTooltips.add(summary);
            }
        });

        // The caret moving into a <summary> doesn't fire DOM focus (the editable
        // root keeps focus), so Bootstrap's focus trigger won't notice. Manually
        // show/hide the tooltip on model-selection changes so the hint also
        // appears when the user navigates into the title via keyboard or click.
        this.listenTo(editor.model.document.selection, "change:range", () => {
            const summaryModel = editor.model.document.selection.getFirstPosition()?.findAncestor("summary");
            const targetDom = summaryModel ? this._getDom<HTMLElement>(summaryModel) : null;

            // No-op when the target hasn't changed (selection moves on every keystroke
            // while typing in the summary; re-calling show() retriggers the animation).
            if (this._caretShownTooltip === targetDom) return;

            if (this._caretShownTooltip) {
                Tooltip.getInstance(this._caretShownTooltip)?.hide();
                this._caretShownTooltip = undefined;
            }
            if (targetDom) {
                Tooltip.getInstance(targetDom)?.show();
                this._caretShownTooltip = targetDom;
            }
        });
    }

    // -----------------------------------------------------------------
    // Model post-fixers
    // -----------------------------------------------------------------

    private _registerPostFixers() {
        const document = this.editor.model.document;
        document.registerPostFixer(writer => this._structuralPostFixer(writer));
        document.registerPostFixer(writer => this._summaryInvariantPostFixer(writer));
        document.registerPostFixer(writer => this._gapPostFixer(writer));
        document.registerPostFixer(writer => this._hiddenBodyPostFixer(writer));
    }

    /**
     * Cleanup invariants after every change:
     *  - <summary> not inside <details> → remove it
     *  - <details> with no children → remove it
     * For inserts we walk the inserted subtree to catch orphans nested inside it.
     * For removes we check whether the removal emptied a <details> (the removed
     * node itself is gone; `entry.position.nodeAfter` is the node that took its
     * place, not the removed one — never inspect it directly).
     */
    private _structuralPostFixer(writer: any): boolean {
        const changes = this.editor.model.document.differ.getChanges();
        for (const entry of changes) {
            if (entry.type === "insert") {
                const node = (entry as any).position.nodeAfter;
                if (!node || !node.is("element")) continue;
                for (const item of writer.createRangeOn(node).getItems()) {
                    if (item.is("element", "summary") && !item.parent?.is("element", "details")) {
                        writer.remove(item);
                        return true;
                    }
                    if (item.is("element", "details") && item.isEmpty) {
                        writer.remove(item);
                        return true;
                    }
                }
            } else if (entry.type === "remove") {
                const parent = (entry as any).position.parent;
                if (parent?.is("element", "details") && parent.isEmpty) {
                    writer.remove(parent);
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Every <details> must start with exactly one <summary> child. Defends against:
     *   - pasted/imported HTML with no <summary>, multiple <summary>, or summary
     *     not as the first child
     *   - the user dragging the <summary> out of its <details>
     *   - block-level commands (heading, etc.) renaming the summary to something
     *     else
     *
     * When a summary is missing we insert a blank one rather than re-using the
     * first existing child — the other content stays put as body, and the user
     * sees a fresh empty title to fill in.
     */
    private _summaryInvariantPostFixer(writer: any): boolean {
        const changes = this.editor.model.document.differ.getChanges();
        const visited = new Set<any>();

        const ensureValid = (details: any): boolean => {
            if (visited.has(details)) return false;
            visited.add(details);

            const summaries: any[] = [];
            for (const child of details.getChildren()) {
                if (child.is("element", "summary")) summaries.push(child);
            }

            if (summaries.length === 0) {
                writer.insert(writer.createElement("summary"), details, 0);
                return true;
            }

            // Extra <summary>s: demote them to paragraphs (text content preserved).
            if (summaries.length > 1) {
                for (let i = 1; i < summaries.length; i++) {
                    writer.rename(summaries[i], "paragraph");
                }
                return true;
            }

            // Single summary but not at position 0: move it.
            if (details.getChild(0) !== summaries[0]) {
                writer.move(writer.createRangeOn(summaries[0]), writer.createPositionAt(details, 0));
                return true;
            }

            return false;
        };

        for (const entry of changes) {
            if (entry.type === "insert") {
                const node = (entry as any).position.nodeAfter;
                if (node?.is("element")) {
                    for (const item of writer.createRangeOn(node).getItems()) {
                        if (item.is("element", "details") && ensureValid(item)) return true;
                    }
                }
                // Also validate the receiving parent — e.g. dragging a <summary>
                // into a <details> that already has one gives us two summaries.
                const parent = (entry as any).position?.parent;
                if (parent?.is("element", "details") && ensureValid(parent)) return true;
            } else if (entry.type === "remove" || entry.type === "attribute") {
                const parent = (entry as any).position?.parent;
                if (parent?.is("element", "details") && ensureValid(parent)) return true;
            }
        }
        return false;
    }

    /**
     * Prevent the caret from sitting in the "gap" position directly inside a
     * <details> (between summary and a body block). Prefer the previous sibling
     * so the caret stays on the summary line when the block is collapsed.
     */
    private _gapPostFixer(writer: any): boolean {
        const position = this.editor.model.document.selection.getFirstPosition();
        if (!position || !position.parent.is("element", "details")) return false;
        const details = position.parent;
        const before = position.offset > 0 ? details.getChild(position.offset - 1) : null;
        const after = details.getChild(position.offset);

        // If `before` is a nested <details>, landing at its "end" would just put us
        // in another gap (childCount). Dig one level deeper to its last child block.
        if (before?.is("element", "details") && before.childCount > 0) {
            const last = before.getChild(before.childCount - 1);
            if (last?.is("element")) {
                writer.setSelection(last, "end");
                return true;
            }
        }
        if (before?.is("element")) {
            writer.setSelection(before, "end");
            return true;
        }
        if (after?.is("element")) {
            writer.setSelection(after, 0);
            return true;
        }
        return false;
    }

    /**
     * Never let the caret rest inside a body whose enclosing <details> is
     * collapsed (so it doesn't disappear into hidden content, and so widget
     * toolbars don't trigger for invisible elements).
     */
    private _hiddenBodyPostFixer(writer: any): boolean {
        const position = this.editor.model.document.selection.getFirstPosition();
        if (!position) return false;

        let outermostClosed: any = null;
        for (let node: any = position.parent; node; node = node.parent) {
            if (!node.is?.("element", "details")) continue;
            const dom = this._getDom<HTMLDetailsElement>(node);
            if (dom && !dom.open) outermostClosed = node;
        }
        if (!outermostClosed) return false;

        const summary = outermostClosed.getChild(0);
        if (!summary?.is("element", "summary")) return false;
        if (position.findAncestor("summary") === summary) return false;

        writer.setSelection(summary, "end");
        return true;
    }
}
