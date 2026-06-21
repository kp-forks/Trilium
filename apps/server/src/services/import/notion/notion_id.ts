/**
 * Notion-export identity helpers. Every page/attachment Notion exports carries a 32-character hex id
 * appended to its file and folder names ("Page Title <id>.html", "Page Title <id>/"), and internal
 * links reference those same names. These helpers extract and strip those ids and derive a page's
 * ancestry from its path inside the zip.
 *
 * Ported from Obsidian's importer (https://github.com/obsidianmd/obsidian-importer,
 * src/formats/notion/notion-utils.ts and parse-info.ts), MIT-licensed, © 2023 Obsidian.
 */

/** Strips the trailing Notion id (and its separating space/hyphen) from a name, keeping the extension. */
export function stripNotionId(id: string): string {
    return id.replace(/-/g, "").replace(/[ -]?[a-z0-9]{32}(\.|$)/, "$1");
}

/** Extracts the 32-hex Notion id embedded at the end of a filename or URL path, or undefined if absent. */
export function getNotionId(id: string): string | undefined {
    return id.replace(/-/g, "").match(/([a-z0-9]{32})(\?|\.|$)/)?.[1];
}

/**
 * Returns the Notion ids of a file's ancestor pages, outermost first, read from its folder path inside
 * the zip. Folder segments without an id (e.g. the export's top-level workspace folder) are dropped, so
 * the last entry is the file's immediate parent page.
 */
export function parseParentIds(filePath: string): string[] {
    // Zip entry names always use forward slashes, so split on "/" directly (rather than a node `path`
    // helper, whose behaviour differs on Windows) and drop the last segment (the file itself).
    const segments = filePath.split("/");
    segments.pop();
    return segments
        .map((segment) => getNotionId(segment))
        .filter((id): id is string => !!id);
}
