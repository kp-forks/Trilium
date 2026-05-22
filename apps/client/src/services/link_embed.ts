import type { LinkEmbedMetadata } from "@triliumnext/commons";
import type { EmbedMetadata } from "@triliumnext/ckeditor5";
import server from "./server.js";

/** Paste mode chosen by user from the floating popup. */
export type LinkPasteMode = "mention" | "url" | "embed";

const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

export function detectEmbedType(url: string): "youtube" | "opengraph" {
    return YOUTUBE_REGEX.test(url) ? "youtube" : "opengraph";
}

/**
 * Fetches link metadata from the server. Called once at link creation time.
 * The returned metadata is then stored in the note's HTML as data attributes.
 */
export async function fetchMetadata(url: string): Promise<EmbedMetadata> {
    try {
        const metadata = await server.get<LinkEmbedMetadata>(`link-embed/metadata?url=${encodeURIComponent(url)}`);
        return {
            url: metadata.url,
            embedType: metadata.embedType,
            title: metadata.title,
            description: metadata.description,
            favicon: metadata.favicon,
            siteName: metadata.siteName,
            image: metadata.image
        };
    } catch {
        return {
            url,
            embedType: detectEmbedType(url),
            title: safeHostname(url)
        };
    }
}

export function safeHostname(url: string): string {
    try { return new URL(url).hostname; } catch { return url; }
}

export default {
    fetchMetadata,
    detectEmbedType,
    safeHostname
};
