import { defineConfig } from "vite";

export default defineConfig({
    manifest: {
        permissions: [
            "activeTab",
            "tabs",
            "http://*/",
            "https://*/",
            "<all_urls>",
            "storage",
            "contextMenus"
        ]
    }
});
