import type { TokenizerAndRendererExtension } from "marked";

export interface WikiLinkOptions {
    /** Format the href for the link. Defaults to `/${noteId}` */
    formatHref?: (noteId: string) => string;
}

/**
 * Creates a wiki-link extension for internal note links: [[noteId]]
 *
 * @example
 * // Server-side (for import)
 * createWikiLinkExtension() // uses default /${noteId}
 *
 * // Client-side (for navigation)
 * createWikiLinkExtension({ formatHref: (id) => `#root/${id}` })
 */
export function createWikiLinkExtension(options: WikiLinkOptions = {}): TokenizerAndRendererExtension {
    const formatHref = options.formatHref ?? ((id) => `/${id}`);

    return {
        name: "wikiLink",
        level: "inline",

        start(src: string) {
            return src.indexOf("[[");
        },

        tokenizer(src) {
            const match = /^\[\[([^\]]+?)\]\]/.exec(src);
            if (match) {
                return {
                    type: "wikiLink",
                    raw: match[0],
                    text: match[1].trim(),
                    href: match[1].trim()
                };
            }
        },

        renderer(token) {
            const noteId = token.href as string;
            return `<a class="reference-link" href="${formatHref(noteId)}">${token.text}</a>`;
        }
    };
}

export interface TransclusionOptions {
    /** Format the src for the image/embed. Defaults to `/${noteId}` */
    formatSrc?: (noteId: string) => string;
}

/**
 * Creates a transclusion extension for embedding note content: ![[noteId]]
 * Terminology inspired by https://silverbullet.md/Transclusions
 *
 * @example
 * createTransclusionExtension() // uses default /${noteId}
 * createTransclusionExtension({ formatSrc: (id) => `/api/images/${id}` })
 */
export function createTransclusionExtension(options: TransclusionOptions = {}): TokenizerAndRendererExtension {
    const formatSrc = options.formatSrc ?? ((id) => `/${id}`);

    return {
        name: "transclusion",
        level: "inline",

        start(src: string) {
            return src.match(/!\[\[/)?.index;
        },

        tokenizer(src) {
            const match = /^!\[\[([^\]]+?)\]\]/.exec(src);
            if (match) {
                return {
                    type: "transclusion",
                    raw: match[0],
                    href: match[1].trim()
                };
            }
        },

        renderer(token) {
            const noteId = token.href as string;
            return `<img src="${formatSrc(noteId)}">`;
        }
    };
}

/** Pre-configured wiki-link extension for server-side (uses /noteId format) */
export const wikiLinkExtension = createWikiLinkExtension();

/** Pre-configured transclusion extension for server-side (uses /noteId format) */
export const transclusionExtension = createTransclusionExtension();
