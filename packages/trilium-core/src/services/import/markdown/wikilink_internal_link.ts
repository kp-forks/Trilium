import { TokenizerAndRendererExtension } from "marked";

const wikiLinkInternalLink: TokenizerAndRendererExtension = {
    name: "wikilinkInternalLink",
    level: "inline",

    start(src: string) {
        return src.indexOf('[[');
    },

    tokenizer(src) {
        const match = /^\[\[([^\]]+?)\]\]/.exec(src);
        if (match) {
            return {
                type: 'wikilinkInternalLink',
                raw: match[0],
                text: match[1].trim(), // what shows as link text
                href: match[1].trim()
            };
        }
    },

    renderer(token) {
        return `<a class="reference-link" href="/${token.href}">${token.text}</a>`;
    }

}

export default wikiLinkInternalLink;
