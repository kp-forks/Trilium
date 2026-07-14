export const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?[^\s#]*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

export function extractYouTubeVideoId(url: string): string | null {
    const match = url.match(YOUTUBE_REGEX);
    return match ? match[1] : null;
}

export interface LinkEmbedMetadata {
    url: string;
    title?: string;
    description?: string;
    image?: string;
    favicon?: string;
    siteName?: string;
    embedType: "youtube" | "opengraph";
    /**
     * True when the page could not be read at all — a network error, a bot challenge (many sites
     * answer a server-side fetch with a Cloudflare interstitial), a non-HTML response, or a page
     * carrying no title of its own. The remaining fields then hold nothing but a hostname-derived
     * placeholder, so an auto-detected URL is left as a plain link rather than becoming a preview
     * that shows less than the URL itself did. Never persisted into the note's HTML.
     */
    unresolved?: boolean;
}

/**
 * A runtime-neutral view of a block's child node, decoupled from any editor's
 * model types so the logic below can be unit-tested with plain objects.
 */
export interface BlockChildLike {
    /** True for a text node; false for any element (image, soft break, widget, …). */
    isText: boolean;
    /** Text contents when `isText`; ignored otherwise. */
    data?: string;
}

/**
 * True when `url` is the sole content of a block — its only non-whitespace text
 * is the URL and it holds no other elements. Surrounding whitespace (such as the
 * trailing space that triggers auto-linking) is ignored.
 */
export function isUrlAloneInBlock(children: Iterable<BlockChildLike>, url: string): boolean {
    let text = "";
    for (const child of children) {
        // Any non-text node (inline image, soft break, mention, …) means the
        // URL isn't alone.
        if (!child.isText) {
            return false;
        }
        text += child.data ?? "";
    }
    return text.trim() === url;
}

export type LinkPreviewKind = "embed" | "mention";

/**
 * Chooses how an auto-detected URL should be previewed: a block embed (e.g. a
 * YouTube player) only for an embeddable URL that stands alone in its block;
 * every other URL — including an embeddable one surrounded by text — becomes an
 * inline mention.
 */
export function chooseLinkPreviewKind(embedType: string, urlAloneInBlock: boolean): LinkPreviewKind {
    return embedType !== "opengraph" && urlAloneInBlock ? "embed" : "mention";
}
