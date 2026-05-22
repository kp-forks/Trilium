import type { Request } from "express";
import { parse } from "node-html-parser";
import type { LinkEmbedMetadata } from "@triliumnext/commons";
import log from "../../services/log.js";
import { ValidationError } from "@triliumnext/core";

const FETCH_TIMEOUT_MS = 5000;
const MAX_RESPONSE_SIZE = 512 * 1024; // 512KB

const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

const BLOCKED_HOSTNAME_PATTERNS = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^0\./,
    /^169\.254\./,
    /^\[::1\]$/,
    /^\[fc/i,
    /^\[fd/i,
    /^\[fe80:/i
];

function extractYouTubeVideoId(url: string): string | null {
    const match = url.match(YOUTUBE_REGEX);
    return match ? match[1] : null;
}

function validateUrl(urlString: string): URL {
    let parsed: URL;
    try {
        parsed = new URL(urlString);
    } catch {
        throw new ValidationError("Invalid URL");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new ValidationError("Only http and https URLs are supported");
    }

    for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
        if (pattern.test(parsed.hostname)) {
            throw new ValidationError("URLs pointing to private/internal networks are not allowed");
        }
    }

    return parsed;
}

/**
 * Fetches YouTube metadata via the public oEmbed endpoint.
 * This works reliably unlike scraping youtube.com (which blocks bots).
 */
async function fetchYouTubeMetadata(url: string, videoId: string): Promise<LinkEmbedMetadata> {
    const metadata: LinkEmbedMetadata = {
        url,
        image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        favicon: "https://www.youtube.com/favicon.ico",
        siteName: "YouTube",
        embedType: "youtube"
    };

    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const response = await fetch(oembedUrl, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (data.title) metadata.title = data.title;
        if (data.author_name) metadata.description = data.author_name;
        if (data.thumbnail_url) metadata.image = data.thumbnail_url;
    } catch {
        metadata.title = "YouTube Video";
    }

    return metadata;
}

async function fetchOpenGraphData(url: string) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
        headers: {
            "User-Agent": "TriliumBot/1.0 (Link Preview)",
            "Accept": "text/html"
        }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = (await response.text()).slice(0, MAX_RESPONSE_SIZE);
    const document = parse(html);

    const getMeta = (property: string): string | undefined => {
        const ogEl = document.querySelector(`meta[property="${property}"]`);
        if (ogEl) return ogEl.getAttribute("content") || undefined;

        const nameEl = document.querySelector(`meta[name="${property}"]`);
        if (nameEl) return nameEl.getAttribute("content") || undefined;

        return undefined;
    };

    const faviconEl = document.querySelector('link[rel="icon"]')
        || document.querySelector('link[rel="shortcut icon"]')
        || document.querySelector('link[rel="apple-touch-icon"]');
    let favicon: string | undefined;
    if (faviconEl) {
        const href = faviconEl.getAttribute("href");
        if (href) {
            try { favicon = new URL(href, url).toString(); } catch { /* ignore */ }
        }
    }
    if (!favicon) {
        try { favicon = `${new URL(url).origin}/favicon.ico`; } catch { /* ignore */ }
    }

    return {
        title: getMeta("og:title") || document.querySelector("title")?.textContent || undefined,
        description: getMeta("og:description") || getMeta("description") || undefined,
        image: getMeta("og:image") || undefined,
        siteName: getMeta("og:site_name") || undefined,
        favicon
    };
}

async function getMetadata(req: Request) {
    const urlParam = req.query.url;

    if (!urlParam || typeof urlParam !== "string") {
        throw new ValidationError("'url' query parameter is required");
    }

    const validatedUrl = validateUrl(urlParam);
    const url = validatedUrl.toString();
    const videoId = extractYouTubeVideoId(url);

    if (videoId) {
        return await fetchYouTubeMetadata(url, videoId);
    }

    try {
        const ogData = await fetchOpenGraphData(url);
        return {
            url,
            title: ogData.title,
            description: ogData.description,
            image: ogData.image,
            favicon: ogData.favicon,
            siteName: ogData.siteName,
            embedType: "opengraph"
        } satisfies LinkEmbedMetadata;
    } catch (e: unknown) {
        log.info(`Failed to fetch metadata for ${url}: ${e}`);
        return {
            url,
            title: validatedUrl.hostname,
            embedType: "opengraph"
        } satisfies LinkEmbedMetadata;
    }
}

export default { getMetadata };
