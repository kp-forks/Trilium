/**
 * Where a media player is being rendered. The note detail is `standalone`; a note included in a text note
 * or embedded in a canvas is `embedded`; a lightweight preview such as a collection tile or an attachment
 * list is `preview`.
 */
export type MediaEnvironment = "standalone" | "embedded" | "preview";

/**
 * Whether the player is mounted right away, or only once the user clicks the placeholder's play button.
 * A preview is lazy: many of them are on screen at once, and each media element that exists starts
 * streaming from the server, so none is created until the user actually asks for it.
 */
export function loadsEagerly(environment: MediaEnvironment): boolean {
    return environment !== "preview";
}

/** How much a mounted player may buffer ahead: only the note detail is worth pre-loading in full. */
export function preloadFor(environment: MediaEnvironment): "auto" | "metadata" {
    return environment === "standalone" ? "auto" : "metadata";
}
