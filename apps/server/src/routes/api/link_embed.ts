import { extractYouTubeVideoId, type LinkEmbedMetadata } from "@triliumnext/commons";
import { getLog, ValidationError } from "@triliumnext/core";
import type { Request } from "express";
import { parse } from "node-html-parser";

import { safeFetch, validateUrl } from "../../services/safe_fetch.js";

const MAX_RESPONSE_SIZE = 512 * 1024; // 512KB
const MAX_FAVICON_SIZE = 64 * 1024; // 64KB

/**
 * Reads the response body as text, stopping after maxBytes to avoid
 * buffering arbitrarily large responses into memory.
 */
async function readResponseText(response: Response, maxBytes: number): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return "";

    const decoder = new TextDecoder();
    let result = "";
    let bytesRead = 0;

    while (bytesRead < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;

        bytesRead += value.byteLength;
        result += decoder.decode(value, { stream: true });
    }

    void reader.cancel();
    return result.slice(0, maxBytes);
}

/**
 * Downloads a favicon and returns it as a base64 data URI.
 * Returns undefined if the download fails or the image is too large.
 */
async function downloadFaviconAsDataUri(faviconUrl: string): Promise<string | undefined> {
    try {
        const response = await safeFetch(faviconUrl);

        if (!response.ok) return undefined;

        // Bail early if the server advertises a size over the limit
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_FAVICON_SIZE) return undefined;

        const contentType = response.headers.get("content-type") || "image/x-icon";

        // Stream the body and enforce the size limit during download
        const reader = response.body?.getReader();
        if (!reader) return undefined;

        const chunks: Uint8Array[] = [];
        let bytesRead = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            bytesRead += value.byteLength;
            if (bytesRead > MAX_FAVICON_SIZE) {
                void reader.cancel();
                return undefined;
            }
            chunks.push(value);
        }

        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString("base64");
        return `data:${contentType.split(";")[0]};base64,${base64}`;
    } catch {
        return undefined;
    }
}

/**
 * Resolves a URL found in the page (`og:image` content, favicon `href`, …) against the page's own
 * address, so a root-relative or relative one — both legal and common — becomes absolute. Without
 * this the value would later be resolved against Trilium's origin instead of the site's.
 * Returns undefined when the value cannot form a URL at all.
 */
function toAbsoluteUrl(href: string | undefined, pageUrl: string): string | undefined {
    if (!href) return undefined;
    try {
        return new URL(href, pageUrl).toString();
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

    let faviconUrl = toAbsoluteUrl(faviconEl?.getAttribute("href"), pageUrl);
    if (!faviconUrl) {
        faviconUrl = toAbsoluteUrl("/favicon.ico", pageUrl);
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
        const response = await safeFetch(oembedUrl);

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
            "User-Agent": "TriliumNotes/1.0 (Link Preview; +https://triliumnotes.org/)",
            "Accept": "text/html"
        }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        throw new Error(`Unexpected Content-Type: ${contentType}`);
    }

    const html = await readResponseText(response, MAX_RESPONSE_SIZE);
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
        title: getMeta("og:title") || document.querySelector("title")?.textContent?.trim() || undefined,
        description: getMeta("og:description") || getMeta("description") || undefined,
        image: toAbsoluteUrl(getMeta("og:image"), url),
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

    // A YouTube link stays resolved even when oEmbed is unreachable: the player embeds from the
    // video ID alone, so the preview is worth showing with or without the title and channel.
    if (videoId) {
        return await fetchYouTubeMetadata(url, videoId);
    }

    try {
        const ogData = await fetchOpenGraphData(url);

        // A page that answered but names itself nowhere (no og:title, no <title>) leaves us with
        // the hostname we already had, which is no better than a failed fetch.
        if (!ogData.title) {
            return unresolvedMetadata(validatedUrl);
        }

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
        getLog().info(`Failed to fetch metadata for ${url}: ${e}`);
        return unresolvedMetadata(validatedUrl);
    }
}

/**
 * The degraded result for a URL whose page told us nothing: everything the caller gets back is
 * derived from the URL itself. Flagged so the caller can keep a plain link instead of rendering a
 * preview that would show less than the link did.
 */
function unresolvedMetadata(url: URL): LinkEmbedMetadata {
    return {
        url: url.toString(),
        title: url.hostname,
        embedType: "opengraph",
        unresolved: true
    };
}

export default { getMetadata };
