/**
 * Tracks the asynchronous tail of content rendering.
 *
 * Most render paths are awaitable: `content_renderer.getRenderedContent()` returns once the note's
 * content is in the DOM. Components are not — a widget that renders HTML kicks off its transform
 * passes (mermaid, KaTeX, syntax highlighting, included notes, all of which lazily import their
 * library) from a layout effect and never awaits them, because on screen they simply paint when they
 * are ready.
 *
 * That breaks any caller that snapshots the finished DOM instead of watching it: printing / PDF
 * export captures the page once, so a transform that lands after the capture is silently missing from
 * the output. Such a caller awaits {@link waitForPendingRenders} to get a settled DOM.
 */
const pending = new Set<Promise<unknown>>();

/** Registers async render work, so that {@link waitForPendingRenders} waits for it. */
export function trackPendingRender(work: Promise<unknown>) {
    // Failures are the tracked work's own business: a transform that throws still finishes, and a
    // caller waiting for a settled DOM should proceed rather than inherit the rejection.
    const tracked = work.catch(() => undefined);
    pending.add(tracked);
    void tracked.then(() => pending.delete(tracked));
}

/**
 * Resolves once all tracked render work has settled, including work that other work scheduled (an
 * included note renders its own content, which highlights its own code blocks, …).
 */
export async function waitForPendingRenders() {
    while (pending.size > 0) {
        await Promise.all([...pending]);
    }
}
