import type { TokenizerAndRendererExtension } from "marked";

/**
 * The terminology is inspired by https://silverbullet.md/Transclusions.
 */
const wikiLinkTransclusion: TokenizerAndRendererExtension = {
    name: "wikiLinkTransclusion",
    level: "inline",

    start(src: string) {
        return src.match(/!\[\[/)?.index;
    },

    tokenizer(src) {
        const match = /^!\[\[([^\]]+?)\]\]/.exec(src);
        if (match) {
            return {
                type: "wikiLinkTransclusion",
                raw: match[0],
                href: match[1].trim(),
            };
        }
    },

    renderer(token) {
        return `<img src="/${token.href}">`;
    }
};

export default wikiLinkTransclusion;
