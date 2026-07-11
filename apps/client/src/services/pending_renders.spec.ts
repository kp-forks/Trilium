import { describe, expect, it } from "vitest";

import { trackPendingRender, waitForPendingRenders } from "./pending_renders.js";

function deferred() {
    let resolve: () => void = () => {};
    let reject: (e: unknown) => void = () => {};
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/** Lets every already-queued microtask (and the promise chains they queue) run to completion. */
function flushMicrotasks() {
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Whether `waitForPendingRenders()` has resolved, without blocking on it. */
function watchCompletion() {
    const state = { done: false };
    void waitForPendingRenders().then(() => {
        state.done = true;
    });
    return state;
}

describe("pending renders", () => {
    it("resolves immediately when nothing is tracked", async () => {
        await expect(waitForPendingRenders()).resolves.toBeUndefined();
    });

    it("waits for tracked work, including work scheduled by tracked work", async () => {
        const first = deferred();
        const second = deferred();
        trackPendingRender(first.promise);

        const completion = watchCompletion();
        await Promise.resolve();
        expect(completion.done).toBe(false);

        // An included note renders its own content: work that only gets tracked once the first
        // pass has finished must still be waited for.
        first.resolve();
        trackPendingRender(second.promise);
        await Promise.resolve();
        expect(completion.done).toBe(false);

        second.resolve();
        await flushMicrotasks();
        expect(completion.done).toBe(true);
    });

    it("does not stall or reject when tracked work fails", async () => {
        const failing = deferred();
        trackPendingRender(failing.promise);

        failing.reject(new Error("mermaid blew up"));

        await expect(waitForPendingRenders()).resolves.toBeUndefined();
    });
});
