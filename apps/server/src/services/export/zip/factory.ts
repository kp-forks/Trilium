import { type ExportFormat, type ZipExportProviderData, ZipExportProvider } from "@triliumnext/core";

export async function serverZipExportProviderFactory(format: ExportFormat, data: ZipExportProviderData): Promise<ZipExportProvider> {
    switch (format) {
        case "html": {
            const { default: HtmlExportProvider } = await import("@triliumnext/core/src/services/export/zip/html.js");
            return new HtmlExportProvider(data);
        }
        case "markdown": {
            const { default: MarkdownExportProvider } = await import("@triliumnext/core/src/services/export/zip/markdown.js");
            return new MarkdownExportProvider(data);
        }
        case "share": {
            const { default: ShareThemeExportProvider } = await import("./share_theme.js");
            return new ShareThemeExportProvider(data);
        }
        default:
            throw new Error(`Unsupported export format: '${format}'`);
    }
}
