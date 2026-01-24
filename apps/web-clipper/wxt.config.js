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
        ],
        browser_specific_settings: {
            gecko: {
                id: "{1410742d-b377-40e7-a9db-63dc9c6ec99c}"
            }
        }
    }
});
