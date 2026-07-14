export const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?[^\s#]*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

export function extractYouTubeVideoId(url: string): string | null {
    const match = url.match(YOUTUBE_REGEX);
    return match ? match[1] : null;
}

/**
 * A URL trimmed to origin + path for logging.
 *
 * The query and fragment are where the secrets live — a password-reset token, a signed S3
 * signature, a document-sharing key — and a log line is exactly the wrong place for them: logs get
 * rotated, backed up, shipped to aggregators and pasted into bug reports. The `?…` marks that
 * parameters were present, which is all a reader of the log needs to know.
 */
export function redactUrlForLog(url: string): string {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return "<unparseable URL>";
    }

    const withoutParams = `${parsed.origin}${parsed.pathname}`;
    return parsed.search || parsed.hash ? `${withoutParams}?…` : withoutParams;
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

export type LinkPreviewKind = "embed" | "card" | "mention";

/** Where an auto-detected URL sits, and what the user did right after typing it. */
export interface LinkPreviewPlacement {
    /** The URL is the block's only content (see {@link isUrlAloneInBlock}). */
    urlAloneInBlock: boolean;
    /**
     * The block is a plain top-level paragraph — not a list item, table cell, quote or heading.
     * A block-level preview inside those reads as a layout accident, so they stay inline.
     */
    blockIsStandalone: boolean;
    /**
     * The caret has left the block, which is what pressing Enter does. While the caret is still
     * there the user is plausibly mid-sentence, so the URL has not (yet) been *left* alone.
     */
    caretLeftBlock: boolean;
}

/**
 * Chooses how an auto-detected URL should be previewed.
 *
 * A URL only becomes a block-level preview when the user deliberately left it alone on its own
 * line — sole content of a plain paragraph, then Enter. That gesture is the signal; anything else
 * (text either side, a list/table/quote, or a caret still sitting in the block because the user is
 * still typing) yields an unobtrusive inline mention.
 *
 * Given that gesture, the URL decides which block form: an embeddable one (e.g. YouTube) becomes a
 * player, everything else a card.
 */
export function chooseLinkPreviewKind(embedType: string, placement: LinkPreviewPlacement): LinkPreviewKind {
    if (!placement.urlAloneInBlock || !placement.blockIsStandalone || !placement.caretLeftBlock) {
        return "mention";
    }

    return embedType !== "opengraph" ? "embed" : "card";
}
