import { defineConfig } from "wxt";

export default defineConfig({
    modules: ['@wxt-dev/auto-icons'],
    manifest: ({ manifestVersion }) => ({
        name: "Trilium Web Clipper",
        description: "Save web clippings to Trilium Notes.",
        homepage_url: "https://docs.triliumnotes.org/user-guide/setup/web-clipper",
        permissions: [
            "activeTab",
            "tabs",
            "http://*/",
            "https://*/",
            "<all_urls>",
            "storage",
            "contextMenus",
            manifestVersion === 3 && "offscreen"
        ].filter(Boolean),
        browser_specific_settings: {
            gecko: {
                // See https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings#id.
                id: "web-clipper@triliumnotes.org"
            }
        },
        commands: {
            saveSelection: {
                description: "Save the selected text into a note",
                suggested_key: {
                    default: "Ctrl+Shift+S"
                }
            },
            saveWholePage: {
                description: "Save the current page",
                suggested_key: {
                    default: "Alt+Shift+S"
                }
            },
            saveCroppedScreenshot: {
                description: "Take a cropped screenshot of the current page",
                suggested_key: {
                    default: "Ctrl+Shift+E"
                }
            }
        }
    })
});
