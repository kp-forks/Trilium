import { afterEach } from "vitest";

import { destroyTrackedEditors } from "./editor-kit.js";

/**
 * Global test setup, registered via `setupFiles` in vitest.config.ts and run before every
 * spec. Owns the editor teardown that each spec used to repeat: any editor created through
 * `createTestEditor()` is destroyed and its host element removed after every test.
 */
afterEach(async () => {
    await destroyTrackedEditors();
});
