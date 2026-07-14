import { extractYouTubeVideoId, type LinkEmbedMetadata } from "@triliumnext/commons";
import { getLog, ValidationError } from "@triliumnext/core";
import type { Request } from "express";
import isSvg from "is-svg";
import { Jimp } from "jimp";
import { parse } from "node-html-parser";

import { safeFetch, validateUrl } from "../../services/safe_fetch.js";

const MAX_RESPONSE_SIZE = 512 * 1024; // 512KB
const MAX_FAVICON_SIZE = 64 * 1024; // 64KB

/** Longest edge of the preview image kept in the note; larger images are scaled down to fit. */
const IMAGE_MAX_DIMENSION = 256;
/** Quality used when re-encoding an opaque preview image to JPEG. */
const IMAGE_JPEG_QUALITY = 75;
/** Refuse to even decode a preview image larger than this. */
const MAX_IMAGE_DOWNLOAD_SIZE = 5 * 1024 * 1024; // 5MB
/**
 * Cap for an image kept byte-for-byte instead of being re-encoded — an SVG (which scales natively,
 * so rasterising it would only lose quality) or a format Jimp cannot decode (WebP, AVIF).
 */
const MAX_VERBATIM_IMAGE_SIZE = 200 * 1024; // 200KB

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
 * Downloads a binary resource, refusing anything over `maxBytes` — both up front, when the server
 * advertises the size, and while streaming, when it does not.
 * Returns undefined if the download fails or the resource is too large.
 */
async function downloadBinary(url: string, maxBytes: number, defaultContentType: string): Promise<{ buffer: Buffer; contentType: string } | undefined> {
    try {
        const response = await safeFetch(url);

        if (!response.ok) return undefined;

        // Bail early if the server advertises a size over the limit
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > maxBytes) return undefined;

        const contentType = (response.headers.get("content-type") || defaultContentType).split(";")[0];

        // Stream the body and enforce the size limit during download
        const reader = response.body?.getReader();
        if (!reader) return undefined;

        const chunks: Uint8Array[] = [];
        let bytesRead = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            bytesRead += value.byteLength;
            if (bytesRead > maxBytes) {
                void reader.cancel();
                return undefined;
            }
            chunks.push(value);
        }

        return { buffer: Buffer.concat(chunks), contentType };
    } catch {
        return undefined;
    }
}

function toDataUri(contentType: string, buffer: Buffer): string {
    return `data:${contentType};base64,${buffer.toString("base64")}`;
}

/**
 * Downloads a favicon and returns it as a base64 data URI.
 * Returns undefined if the download fails or the image is too large.
 */
async function downloadFaviconAsDataUri(faviconUrl: string): Promise<string | undefined> {
    const downloaded = await downloadBinary(faviconUrl, MAX_FAVICON_SIZE, "image/x-icon");
    if (!downloaded) return undefined;

    return toDataUri(downloaded.contentType, downloaded.buffer);
}

/**
 * Downloads the preview image, scales it down to {@link IMAGE_MAX_DIMENSION} and returns it as a
 * base64 data URI, so the note carries the image itself instead of hotlinking the origin site (which
 * would leak every reader's IP to it, and break whenever the remote URL rots).
 *
 * Transparency is preserved by re-encoding to PNG only when the image actually has non-opaque
 * pixels; an opaque image becomes a JPEG, which is several times smaller — and this ends up inside
 * the note's HTML, so every byte is synced and stored forever.
 *
 * Returns undefined when the image cannot be had at a reasonable size, in which case the preview is
 * still shown without it — the title and description carry the value, not the picture.
 */
async function downloadImageAsDataUri(imageUrl: string): Promise<string | undefined> {
    const downloaded = await downloadBinary(imageUrl, MAX_IMAGE_DOWNLOAD_SIZE, "image/jpeg");
    if (!downloaded) return undefined;

    const { buffer, contentType } = downloaded;
    const isSmallEnoughToKeepVerbatim = buffer.byteLength <= MAX_VERBATIM_IMAGE_SIZE;

    // An SVG scales natively, so it is kept as-is rather than rasterised (Jimp cannot read it anyway).
    // The isSvg() sniff only runs on a buffer we would be willing to keep, to avoid stringifying megabytes.
    if (contentType.includes("svg") || (isSmallEnoughToKeepVerbatim && isSvg(buffer.toString()))) {
        return isSmallEnoughToKeepVerbatim ? toDataUri("image/svg+xml", buffer) : undefined;
    }

    try {
        const image = await Jimp.read(buffer);

        // Only ever scale down: scaleToFit() would happily enlarge a smaller image.
        if (image.bitmap.width > IMAGE_MAX_DIMENSION || image.bitmap.height > IMAGE_MAX_DIMENSION) {
            image.scaleToFit({ w: IMAGE_MAX_DIMENSION, h: IMAGE_MAX_DIMENSION });
        }

        // hasAlpha() inspects the pixels, not just the channel, so an opaque PNG still takes the
        // JPEG path. An animated GIF/WebP collapses to its first frame, which is fine for a thumbnail.
        return image.hasAlpha()
            ? toDataUri("image/png", Buffer.from(await image.getBuffer("image/png")))
            : toDataUri("image/jpeg", Buffer.from(await image.getBuffer("image/jpeg", { quality: IMAGE_JPEG_QUALITY })));
    } catch (e: unknown) {
        // Jimp bundles decoders for PNG/JPEG/GIF/BMP/TIFF only, so a WebP or AVIF lands here. Keep
        // the original bytes when they are small enough — unresized, but still not hotlinked. The
        // content type is checked so that an error page served in place of the image (an undecodable
        // response that is not an image at all) is dropped rather than embedded.
        getLog().info(`Could not decode link preview image ${imageUrl}: ${e}`);
        return isSmallEnoughToKeepVerbatim && contentType.startsWith("image/")
            ? toDataUri(contentType, buffer)
            : undefined;
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
        siteName: "YouTube",
        embedType: "youtube"
    };

    // Download YouTube favicon as data URI
    metadata.favicon = await downloadFaviconAsDataUri("https://www.youtube.com/favicon.ico");

    let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const response = await safeFetch(oembedUrl);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (data.title) metadata.title = data.title;
        if (data.author_name) metadata.description = data.author_name;
        if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
    } catch {
        metadata.title = "YouTube Video";
    }

    // The thumbnail is embedded like any other preview image: it is what Card display mode shows, and
    // hotlinking it would tell YouTube every time the note is opened.
    metadata.image = await downloadImageAsDataUri(thumbnailUrl);

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

    const imageUrl = toAbsoluteUrl(getMeta("og:image"), url);
    const image = imageUrl ? await downloadImageAsDataUri(imageUrl) : undefined;

    return {
        title: getMeta("og:title") || document.querySelector("title")?.textContent?.trim() || undefined,
        description: getMeta("og:description") || getMeta("description") || undefined,
        image,
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
