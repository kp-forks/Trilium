import { defineConfig } from "wxt";

export default defineConfig({
    modules: ['@wxt-dev/auto-icons'],
    manifest: {
        name: "Trilium Web Clipper",
        description: "Save web clippings to Trilium Notes.",
        permissions: [
            "activeTab",
            "tabs",
            "http://*/",
            "https://*/",
            "<all_urls>",
            "storage",
            "contextMenus",
            "offscreen"
        ],
        browser_specific_settings: {
            gecko: {
                id: "{1410742d-b377-40e7-a9db-63dc9c6ec99c}"
            }
        }
    }
});
