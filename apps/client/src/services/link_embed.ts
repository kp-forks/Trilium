import "../widgets/type_widgets/text/LinkEmbed.css";

import type { LinkEmbedMetadata } from "@triliumnext/commons";
import server from "./server.js";

/** Paste mode chosen by user from the floating popup. */
export type LinkPasteMode = "mention" | "url" | "embed";

const metadataCache = new Map<string, LinkEmbedMetadata>();
const pendingRequests = new Map<string, Promise<LinkEmbedMetadata>>();

const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

export function extractYouTubeVideoId(url: string): string | null {
    const match = url.match(YOUTUBE_REGEX);
    return match ? match[1] : null;
}

export function detectEmbedType(url: string): "youtube" | "opengraph" {
    return extractYouTubeVideoId(url) ? "youtube" : "opengraph";
}

export function safeHostname(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

export async function fetchMetadata(url: string): Promise<LinkEmbedMetadata> {
    const cached = metadataCache.get(url);
    if (cached) return cached;

    const pending = pendingRequests.get(url);
    if (pending) return pending;

    const request = server.get<LinkEmbedMetadata>(`link-embed/metadata?url=${encodeURIComponent(url)}`)
        .then((metadata) => {
            metadataCache.set(url, metadata);
            pendingRequests.delete(url);
            return metadata;
        })
        .catch(() => {
            pendingRequests.delete(url);
            const fallback: LinkEmbedMetadata = {
                url,
                title: safeHostname(url),
                embedType: detectEmbedType(url)
            };
            metadataCache.set(url, fallback);
            return fallback;
        });

    pendingRequests.set(url, request);
    return request;
}

// ---------------------------------------------------------------------------
// Loading spinner (shared by all renderers)
// ---------------------------------------------------------------------------

function createLoadingEl(): JQuery<HTMLElement> {
    return $('<div class="link-embed-loader">').append(
        $('<div class="link-embed-loader-dot">'),
        $('<div class="link-embed-loader-dot">'),
        $('<div class="link-embed-loader-dot">')
    );
}

// ---------------------------------------------------------------------------
// Mention renderer  (inline: favicon + title)
// ---------------------------------------------------------------------------

export async function renderMention(url: string, $container: JQuery<HTMLElement>) {
    $container.empty().append(createLoadingEl());

    const metadata = await fetchMetadata(url);
    const $link = $('<a class="link-embed-mention">')
        .attr("href", metadata.url)
        .attr("target", "_blank")
        .attr("rel", "noopener noreferrer");

    const faviconSrc = metadata.favicon
        || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(safeHostname(url))}&sz=32`;

    $link.append(
        $('<img class="link-embed-mention-favicon">')
            .attr("src", faviconSrc)
            .attr("width", "16")
            .attr("height", "16")
            .on("error", function () { $(this).replaceWith($('<span class="link-embed-mention-dot">')); })
    );

    const displayTitle = metadata.embedType === "youtube" && metadata.siteName
        ? `${metadata.siteName} - ${metadata.title || "Video"}`
        : metadata.title || safeHostname(url);

    $link.append($('<span class="link-embed-mention-title">').text(displayTitle));
    $container.empty().append($link);
}

// ---------------------------------------------------------------------------
// Embed renderer  (YouTube = iframe, otherwise = card)
// ---------------------------------------------------------------------------

export async function renderEmbed(url: string, embedType: string, $container: JQuery<HTMLElement>) {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
        const origin = window.location.origin;
        $container.empty().append(
            $('<div class="link-embed-video">').append(
                $('<iframe>')
                    .attr("src", `https://www.youtube-nocookie.com/embed/${videoId}?origin=${encodeURIComponent(origin)}&rel=0`)
                    .attr("frameborder", "0")
                    .attr("allowfullscreen", "true")
                    .attr("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share")
                    .attr("referrerpolicy", "strict-origin-when-cross-origin")
                    .attr("loading", "lazy")
            )
        );
        return;
    }

    // Non-YouTube: card preview
    $container.empty().append(createLoadingEl());

    const metadata = await fetchMetadata(url);
    renderCard(metadata, $container);
}

// ---------------------------------------------------------------------------
// Card renderer (Notion-style: image left, content right)
// ---------------------------------------------------------------------------

function renderCard(metadata: LinkEmbedMetadata, $container: JQuery<HTMLElement>) {
    const $card = $('<a class="link-embed-card">')
        .attr("href", metadata.url)
        .attr("target", "_blank")
        .attr("rel", "noopener noreferrer");

    if (metadata.image) {
        const $imgWrap = $('<div class="link-embed-card-image-wrapper">');
        $imgWrap.append(
            $('<img class="link-embed-card-image">')
                .attr("src", metadata.image)
                .attr("alt", "")
                .attr("loading", "lazy")
                .on("error", function () {
                    $imgWrap.empty().append($('<div class="link-embed-card-image-placeholder">').html("&#128279;"));
                })
        );
        $card.append($imgWrap);
    } else {
        $card.append(
            $('<div class="link-embed-card-image-wrapper">').append(
                $('<div class="link-embed-card-image-placeholder">').html(
                    metadata.embedType === "youtube" ? "&#9654;" : "&#128279;"
                )
            )
        );
    }

    const $content = $('<div class="link-embed-card-content">');
    if (metadata.title) $content.append($('<div class="link-embed-card-title">').text(metadata.title));
    if (metadata.description) $content.append($('<div class="link-embed-card-description">').text(metadata.description));
    $content.append($('<div class="link-embed-card-url">').text(metadata.siteName || safeHostname(metadata.url)));

    $card.append($content);
    $container.empty().append($card);
}

/**
 * Renders the appropriate preview based on embedType.
 * Used by ReadOnlyText and share renderer for persisted elements.
 */
export async function renderPreview(url: string, embedType: string, $container: JQuery<HTMLElement>) {
    if (embedType === "mention") {
        await renderMention(url, $container);
    } else {
        await renderEmbed(url, embedType, $container);
    }
}

export default {
    fetchMetadata,
    renderPreview,
    renderMention,
    renderEmbed,
    detectEmbedType,
    extractYouTubeVideoId,
    safeHostname
};
