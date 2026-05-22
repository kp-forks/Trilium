import "../widgets/type_widgets/text/LinkEmbed.css";

import type { LinkEmbedMetadata } from "@triliumnext/commons";
import server from "./server.js";

/** Paste mode chosen by user from the floating popup. */
export type LinkPasteMode = "mention" | "url" | "embed";

export interface EmbedMetadata {
    url: string;
    embedType: string;
    title?: string;
    description?: string;
    favicon?: string;
    siteName?: string;
    image?: string;
}

const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

export function detectEmbedType(url: string): "youtube" | "opengraph" {
    return YOUTUBE_REGEX.test(url) ? "youtube" : "opengraph";
}

export function safeHostname(url: string): string {
    try { return new URL(url).hostname; } catch { return url; }
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

// ---------------------------------------------------------------------------
// DOM renderers — render previews from stored metadata, no network requests.
// Used by the CKEditor editing downcast (via component interface), the
// read-only text renderer, and postProcessRichContent (tooltips, included
// notes, markdown preview).
// ---------------------------------------------------------------------------

export function renderEmbedPreview(container: HTMLElement, meta: EmbedMetadata) {
    const videoId = YOUTUBE_REGEX.test(meta.url)
        ? meta.url.match(YOUTUBE_REGEX)?.[1]
        : null;

    if (videoId) {
        const origin = window.location.origin;
        const wrapper = document.createElement("div");
        wrapper.className = "link-embed-video";
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?origin=${encodeURIComponent(origin)}&rel=0`;
        iframe.setAttribute("frameborder", "0");
        iframe.setAttribute("allowfullscreen", "true");
        iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
        iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        iframe.loading = "lazy";
        wrapper.appendChild(iframe);
        container.appendChild(wrapper);
        return;
    }

    // Card preview
    const card = document.createElement("a");
    card.className = "link-embed-card";
    card.href = meta.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const imgWrap = document.createElement("div");
    imgWrap.className = "link-embed-card-image-wrapper";
    if (meta.image) {
        const img = document.createElement("img");
        img.className = "link-embed-card-image";
        img.src = meta.image;
        img.alt = "";
        img.loading = "lazy";
        img.onerror = () => {
            imgWrap.innerHTML = '<div class="link-embed-card-image-placeholder">&#128279;</div>';
        };
        imgWrap.appendChild(img);
    } else {
        imgWrap.innerHTML = '<div class="link-embed-card-image-placeholder">&#128279;</div>';
    }
    card.appendChild(imgWrap);

    const content = document.createElement("div");
    content.className = "link-embed-card-content";
    if (meta.title) {
        const titleEl = document.createElement("div");
        titleEl.className = "link-embed-card-title";
        titleEl.textContent = meta.title;
        content.appendChild(titleEl);
    }
    if (meta.description) {
        const descEl = document.createElement("div");
        descEl.className = "link-embed-card-description";
        descEl.textContent = meta.description;
        content.appendChild(descEl);
    }
    const urlEl = document.createElement("div");
    urlEl.className = "link-embed-card-url";
    urlEl.textContent = meta.siteName || safeHostname(meta.url);
    content.appendChild(urlEl);

    card.appendChild(content);
    container.appendChild(card);
}

export function renderMentionPreview(container: HTMLElement, meta: { url: string; title?: string; favicon?: string }) {
    const anchor = document.createElement("a");
    anchor.className = "link-embed-mention";
    anchor.href = meta.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";

    if (meta.favicon) {
        const img = document.createElement("img");
        img.className = "link-embed-mention-favicon";
        img.src = meta.favicon;
        img.width = 16;
        img.height = 16;
        img.onerror = () => {
            const dot = document.createElement("span");
            dot.className = "link-embed-mention-dot";
            img.replaceWith(dot);
        };
        anchor.appendChild(img);
    } else {
        const dot = document.createElement("span");
        dot.className = "link-embed-mention-dot";
        anchor.appendChild(dot);
    }

    const titleSpan = document.createElement("span");
    titleSpan.className = "link-embed-mention-title";
    titleSpan.textContent = meta.title || safeHostname(meta.url);
    anchor.appendChild(titleSpan);

    container.appendChild(anchor);
}

/**
 * Processes all link embed and mention elements in a container, rendering
 * previews from their stored data attributes. Analogous to how
 * `link.loadReferenceLinkTitle` works for reference links.
 */
export function applyLinkEmbeds(container: HTMLElement) {
    for (const embed of container.querySelectorAll<HTMLElement>("section.link-embed")) {
        const url = embed.dataset.url;
        if (!url) continue;
        embed.innerHTML = "";
        renderEmbedPreview(embed, {
            url,
            embedType: embed.dataset.embedType || "opengraph",
            title: embed.dataset.title,
            description: embed.dataset.description,
            favicon: embed.dataset.favicon,
            siteName: embed.dataset.siteName,
            image: embed.dataset.image
        });
    }

    for (const mention of container.querySelectorAll<HTMLElement>("span.link-mention")) {
        const url = mention.dataset.url;
        if (!url) continue;
        mention.innerHTML = "";
        renderMentionPreview(mention, {
            url,
            title: mention.dataset.title,
            favicon: mention.dataset.favicon
        });
    }
}

export default {
    fetchMetadata,
    detectEmbedType,
    safeHostname,
    renderEmbedPreview,
    renderMentionPreview,
    applyLinkEmbeds
};
