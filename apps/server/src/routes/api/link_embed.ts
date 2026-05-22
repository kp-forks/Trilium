import type { Request } from "express";
import dns from "node:dns";
import net from "node:net";
import isIpPrivate from "private-ip";
import { parse } from "node-html-parser";
import type { LinkEmbedMetadata } from "@triliumnext/commons";
import log from "../../services/log.js";
import { ValidationError } from "@triliumnext/core";

const FETCH_TIMEOUT_MS = 5000;
const MAX_RESPONSE_SIZE = 512 * 1024; // 512KB
const MAX_FAVICON_SIZE = 64 * 1024; // 64KB
const MAX_REDIRECTS = 5;

const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

function extractYouTubeVideoId(url: string): string | null {
    const match = url.match(YOUTUBE_REGEX);
    return match ? match[1] : null;
}

/**
 * Resolves the hostname to IP addresses and verifies none are private/reserved.
 */
async function validateHostResolution(hostname: string): Promise<void> {
    // If the hostname is already an IP literal, check it directly
    if (net.isIP(hostname)) {
        if (isIpPrivate(hostname) !== false) {
            throw new ValidationError("URLs pointing to private/internal networks are not allowed");
        }
        return;
    }

    let addresses: dns.LookupAddress[];
    try {
        addresses = await dns.promises.lookup(hostname, { all: true });
    } catch {
        throw new ValidationError("Could not resolve hostname");
    }

    for (const addr of addresses) {
        if (isIpPrivate(addr.address) !== false) {
            throw new ValidationError("URLs pointing to private/internal networks are not allowed");
        }
    }
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

    return parsed;
}

/**
 * Fetches a URL with SSRF protection: resolves the hostname and validates
 * the resulting IP before each request, including on redirects.
 */
async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
    let currentUrl = url;

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
        const parsed = validateUrl(currentUrl);
        await validateHostResolution(parsed.hostname);

        const response = await fetch(currentUrl, {
            ...options,
            redirect: "manual",
            signal: options.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            if (!location) throw new Error("Redirect without Location header");
            // Resolve relative redirects against the current URL
            currentUrl = new URL(location, currentUrl).toString();
            continue;
        }

        return response;
    }

    throw new Error("Too many redirects");
}

/**
 * Downloads a favicon and returns it as a base64 data URI.
 * Returns undefined if the download fails or the image is too large.
 */
async function downloadFaviconAsDataUri(faviconUrl: string): Promise<string | undefined> {
    try {
        const response = await safeFetch(faviconUrl);

        if (!response.ok) return undefined;

        const contentType = response.headers.get("content-type") || "image/x-icon";
        const buffer = await response.arrayBuffer();

        if (buffer.byteLength > MAX_FAVICON_SIZE) return undefined;

        const base64 = Buffer.from(buffer).toString("base64");
        return `data:${contentType.split(";")[0]};base64,${base64}`;
    } catch {
        return undefined;
    }
}

/**
 * Resolves a favicon URL from the parsed HTML, then downloads it as a data URI.
 */
async function resolveFavicon(document: ReturnType<typeof parse>, pageUrl: string): Promise<string | undefined> {
    const faviconEl = document.querySelector('link[rel="icon"]')
        || document.querySelector('link[rel="shortcut icon"]')
        || document.querySelector('link[rel="apple-touch-icon"]');

    let faviconUrl: string | undefined;
    if (faviconEl) {
        const href = faviconEl.getAttribute("href");
        if (href) {
            try { faviconUrl = new URL(href, pageUrl).toString(); } catch { /* ignore */ }
        }
    }
    if (!faviconUrl) {
        try { faviconUrl = `${new URL(pageUrl).origin}/favicon.ico`; } catch { /* ignore */ }
    }

    if (!faviconUrl) return undefined;
    return await downloadFaviconAsDataUri(faviconUrl);
}

/**
 * Fetches YouTube metadata via the public oEmbed endpoint.
 * This works reliably unlike scraping youtube.com (which blocks bots).
 */
async function fetchYouTubeMetadata(url: string, videoId: string): Promise<LinkEmbedMetadata> {
    const metadata: LinkEmbedMetadata = {
        url,
        image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        siteName: "YouTube",
        embedType: "youtube"
    };

    // Download YouTube favicon as data URI
    metadata.favicon = await downloadFaviconAsDataUri("https://www.youtube.com/favicon.ico");

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
    const response = await safeFetch(url, {
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

    const favicon = await resolveFavicon(document, url);

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
