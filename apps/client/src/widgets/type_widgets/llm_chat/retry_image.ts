/**
 * `<img onError={retryImageOnError}>` — retry a failed image load up to three
 * times with exponential backoff and a cache-busting query parameter.
 *
 * Why this exists: when the user uploads an image to a chat note, the server's
 * upload endpoint returns the attachment URL *before* the async image-
 * processing pipeline has written the actual bytes (see `saveImageToAttachment`
 * in `packages/trilium-core/src/services/image.ts`). The first `<img>` fetch
 * 404s for a few hundred milliseconds, the browser caches that 404, and the
 * preview stays broken even after the image becomes available. Re-requesting
 * with a fresh query string sidesteps the cached 404.
 */
export function retryImageOnError(e: Event) {
    const img = e.currentTarget as HTMLImageElement | null;
    if (!img) return;
    const tries = Number(img.dataset.retries ?? "0");
    if (tries >= 3) return;
    // Remember the original URL so successive retries keep cache-busting off
    // the same base, not stacking `?_retry=N` parameters.
    const base = img.dataset.retryBase ?? img.src.replace(/[?&]_retry=\d+$/, "");
    img.dataset.retryBase = base;
    img.dataset.retries = String(tries + 1);
    const separator = base.includes("?") ? "&" : "?";
    setTimeout(() => {
        img.src = `${base}${separator}_retry=${tries + 1}`;
    }, 300 * (tries + 1));
}
