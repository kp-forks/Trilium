import { createBaseConfig } from "../../packages/trilium-e2e/src/base-config";

const port = process.env["TRILIUM_PORT"] ?? "8082";
const baseURL = process.env["BASE_URL"] || `http://127.0.0.1:${port}`;

export default createBaseConfig({
    appDir: __dirname,
    projectName: "standalone",
    webServer: !process.env.TRILIUM_DOCKER ? {
        command: "pnpm vite preview --port " + port,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        cwd: __dirname,
        timeout: 5 * 60 * 1000
    } : undefined,
});
