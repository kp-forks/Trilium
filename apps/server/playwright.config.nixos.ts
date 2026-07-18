// Temporary local config: reuse the standard e2e config but launch the system
// chromium (NixOS: Playwright's downloaded builds can't resolve shared libs).
import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

export default defineConfig({
    ...baseConfig,
    use: {
        ...(baseConfig as { use?: object }).use,
        launchOptions: {
            executablePath: "/etc/profiles/per-user/elian/bin/chromium"
        }
    }
});
