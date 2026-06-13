import { webdriverio } from "@vitest/browser-webdriverio";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        browser: {
            enabled: true,
            provider: webdriverio(),
            headless: true,
            ui: false,
            instances: [{ browser: "chrome" }]
        },
        include: ["src/**/*.spec.ts"],
        globals: true,
        watch: false,
        coverage: {
            thresholds: {
                lines: 100,
                functions: 100,
                branches: 100,
                statements: 100
            },
            provider: "v8",
            // Restrict to this package's own sources. The aggregate imports the sibling
            // @triliumnext/ckeditor5-* workspace packages, whose `src/` would otherwise bleed
            // into this report; they carry their own 100% coverage gates in their own packages.
            allowExternal: false,
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["**/*.{test,spec}.{ts,mts,cts,tsx,js,jsx}", "**/*.d.ts", "**/node_modules/**", "**/ckeditor5-*/**"],
            reporter: ["text", "lcov"]
        }
    }
});
