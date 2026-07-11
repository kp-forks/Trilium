import { Tooltip } from "bootstrap";

/**
 * A tooltip request registered with an {@link EditorTooltipManager}. Any number
 * of independent handles (hover, caret, keyboard-focus …) can be created and
 * pushed onto the manager's visibility stack independently; only the top of the
 * stack is actually rendered, and popping it reveals whatever was pushed
 * underneath.
 *
 * All methods are safe to call after {@link dispose}, in any order.
 */
export interface TooltipHandle {
    /**
     * Push this handle onto the visibility stack. If it's already on the stack,
     * move it to the top. Cancels any pending {@link showAfter}. No-op if the
     * handle's element is detached from the DOM.
     */
    show(): void;
    /**
     * Schedule a {@link show} `ms` from now. If the user calls {@link hide},
     * {@link dispose}, or {@link show} before the timer fires, the pending
     * timer is cancelled. Calling {@link showAfter} again resets the timer.
     * Used for the hover / caret dwell delay so brief flyovers don't pop the
     * tooltip.
     */
    showAfter(ms: number): void;
    /**
     * Remove this handle from the visibility stack (revealing whatever is
     * below) AND cancel any pending {@link showAfter}.
     */
    hide(): void;
    /**
     * Replace the HTML this handle will show. Takes effect immediately if this
     * handle is currently on top of the stack.
     */
    setContent(content: string): void;
    /**
     * Remove this handle from the manager permanently. Idempotent — safe to call
     * from cleanup code even when a `hide()` already ran.
     */
    dispose(): void;
}

export interface EditorTooltipManagerOptions {
    /**
     * Bootstrap Tooltip config applied to every popup this manager creates.
     * `trigger` is always forced to `"manual"` because the stack, not Bootstrap's
     * hover/focus event bindings, decides when a tooltip is visible. `html` is
     * always forced to `true`.
     */
    tooltipOptions?: Partial<Tooltip.Options>;
}

interface StackEntry {
    handle: TooltipHandle;
    element: HTMLElement;
    content: string;
}

/**
 * Stack-based coordinator for tooltips in an editor. Solves two long-standing
 * problems the per-source event-binding approach has:
 *
 *  - **Overlap**: hover and caret sources racing to show/hide the same tooltip
 *    end up flickering as each source's Bootstrap listeners fight the other's
 *    manual `show()`/`hide()` calls.
 *  - **Unwanted teardown**: a source hiding "its" tooltip while a different
 *    source still wants it visible (mouse leaves the checkbox while the caret
 *    is still inside its item) blanks the popup unnecessarily.
 *
 * The manager rents one Bootstrap Tooltip per visible element and mediates
 * every push/pop through {@link _render}, so exactly one popup is on screen at
 * a time and switches are atomic.
 */
export class EditorTooltipManager {

    private _stack: StackEntry[] = [];
    private _currentElement: HTMLElement | null = null;
    private _currentTooltip: Tooltip | null = null;
    private readonly _baseOptions: Partial<Tooltip.Options>;

    constructor(options: EditorTooltipManagerOptions = {}) {
        this._baseOptions = options.tooltipOptions ?? {};
    }

    /**
     * Register a tooltip on `element`. The returned handle is persistent — the
     * caller pushes it on/off the visibility stack at will via `show()`/`hide()`.
     * Call `dispose()` when the source is done with it (e.g. the element was
     * removed from the DOM).
     */
    createHandle(element: HTMLElement, initialContent: string): TooltipHandle {
        // Content lives in the closure so `setContent` can update it lazily —
        // the stack entry (if any) will pick up the new value from the closure
        // through `_render()`'s next content sync.
        let currentContent = initialContent;
        const currentElement = element;
        let pendingTimer: ReturnType<typeof setTimeout> | null = null;
        const cancelPending = () => {
            if (pendingTimer !== null) {
                clearTimeout(pendingTimer);
                pendingTimer = null;
            }
        };
        const self = this;
        const handle: TooltipHandle = {
            show(): void {
                cancelPending();
                if (!currentElement.isConnected) {
                    return;
                }
                self._pushOrMoveTop(this, currentElement, currentContent);
            },
            showAfter(ms: number): void {
                cancelPending();
                pendingTimer = setTimeout(() => {
                    pendingTimer = null;
                    if (!currentElement.isConnected) {
                        return;
                    }
                    self._pushOrMoveTop(handle, currentElement, currentContent);
                }, ms);
            },
            hide(): void {
                cancelPending();
                self._removeEntry(this);
            },
            setContent(newContent: string): void {
                currentContent = newContent;
                const entry = self._stack.find(e => e.handle === handle);
                if (entry) {
                    entry.content = newContent;
                    self._render();
                }
            },
            dispose(): void {
                cancelPending();
                self._removeEntry(this);
            }
        };
        return handle;
    }

    /**
     * Dispose the manager. Any outstanding handles become inert (their
     * `show()`/`setContent()` calls no-op because the stack is empty and won't
     * be repopulated).
     */
    destroy(): void {
        if (this._currentTooltip) {
            this._currentTooltip.dispose();
        }
        this._currentTooltip = null;
        this._currentElement = null;
        this._stack.length = 0;
    }

    private _pushOrMoveTop(handle: TooltipHandle, element: HTMLElement, content: string): void {
        const existingIdx = this._stack.findIndex(e => e.handle === handle);
        if (existingIdx >= 0) {
            const [entry] = this._stack.splice(existingIdx, 1);
            entry.element = element;
            entry.content = content;
            this._stack.push(entry);
        } else {
            this._stack.push({ handle, element, content });
        }
        this._render();
    }

    private _removeEntry(handle: TooltipHandle): void {
        const idx = this._stack.findIndex(e => e.handle === handle);
        if (idx < 0) {
            return;
        }
        this._stack.splice(idx, 1);
        this._render();
    }

    private _render(): void {
        // Reap dead entries anywhere in the stack — a source may have gone away
        // between pushes, and we don't want its stale slot resurfacing on pop.
        this._stack = this._stack.filter(e => e.element.isConnected);

        const top: StackEntry | undefined = this._stack[this._stack.length - 1];
        const targetElement = top?.element ?? null;

        // Same element on top → just refresh content on the existing popup.
        // Bootstrap's `setContent` avoids a dispose+recreate that would fade
        // the popup out and back in for a mere content change.
        if (this._currentElement === targetElement) {
            if (this._currentTooltip && top) {
                this._currentTooltip.setContent({ ".tooltip-inner": top.content });
            }
            return;
        }

        // Element changed (or nothing on top). Dispose the outgoing popup;
        // create + show a fresh one for the new element.
        if (this._currentTooltip) {
            this._currentTooltip.dispose();
            this._currentTooltip = null;
        }
        this._currentElement = targetElement;

        if (top) {
            this._currentTooltip = new Tooltip(top.element, {
                ...this._baseOptions,
                title: top.content,
                html: true,
                trigger: "manual"
            });
            this._currentTooltip.show();
        }
    }

}
