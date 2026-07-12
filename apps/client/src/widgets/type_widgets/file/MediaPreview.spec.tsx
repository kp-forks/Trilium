import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The audio player's extras reach for the network and the Web Audio API, neither of which exists here —
// and neither is what these tests are about (they're covered by audio_waveform.spec / audio_visualizer.spec).
vi.mock("./audio_waveform", () => ({ loadWaveform: vi.fn(async () => null) }));
vi.mock("./AudioVisualizer", () => ({ AudioVisualizer: () => null }));

import type FAttachment from "../../../entities/fattachment";
import type FNote from "../../../entities/fnote";
import MediaPreview from "./MediaPreview";

const videoNote = { noteId: "vid1", title: "Holiday", mime: "video/mp4" } as FNote;
const audioNote = { noteId: "snd1", title: "Podcast", mime: "audio/mpeg" } as FNote;
const audioAttachment = { attachmentId: "att1", title: "Recording", mime: "audio/mpeg" } as FAttachment;

describe("MediaPreview", () => {
    let container: HTMLElement;
    let play: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        // happy-dom doesn't implement playback; the player calls play() when a preview is activated.
        play = vi.fn(async () => {});
        HTMLMediaElement.prototype.play = play as unknown as HTMLMediaElement["play"];
    });

    afterEach(() => {
        render(null, container);
        container.remove();
    });

    const mediaElement = () => container.querySelector("video, audio") as HTMLMediaElement | null;
    const proxyPlayButton = () => container.querySelector(".media-proxy .media-proxy-play") as HTMLElement | null;

    describe("preview (lazy)", () => {
        it("shows the placeholder and creates no media element, so nothing is streamed", async () => {
            await act(async () => render(<MediaPreview entity={videoNote} environment="preview" />, container));

            expect(container.querySelector(".media-proxy")).not.toBeNull();
            expect(proxyPlayButton()).not.toBeNull();
            // The whole point: no <video>/<audio> exists, so the server is never asked for the media.
            expect(mediaElement()).toBeNull();
            expect(play).not.toHaveBeenCalled();
        });

        it("mounts the player on the media itself, and starts playing, once the user presses play", async () => {
            await act(async () => render(<MediaPreview entity={videoNote} environment="preview" />, container));
            await act(async () => proxyPlayButton()?.click());

            expect(container.querySelector(".media-proxy")).toBeNull();
            const media = mediaElement();
            expect(media?.tagName).toBe("VIDEO");
            expect(media?.getAttribute("src")).toBe("api/notes/vid1/open-partial");

            // The media is only just being fetched, so playback waits for it to become playable.
            expect(play).not.toHaveBeenCalled();
            await act(async () => { media?.dispatchEvent(new Event("canplay")); });
            expect(play).toHaveBeenCalled();
        });

        it("plays an attachment through the same placeholder", async () => {
            await act(async () => render(<MediaPreview entity={audioAttachment} environment="preview" />, container));
            expect(mediaElement()).toBeNull();

            await act(async () => proxyPlayButton()?.click());

            const media = mediaElement();
            expect(media?.tagName).toBe("AUDIO");
            expect(media?.getAttribute("src")).toBe("api/attachments/att1/open-partial");
        });
    });

    describe("eager environments", () => {
        it("mounts an embedded player straight away, without auto-playing it", async () => {
            await act(async () => render(<MediaPreview entity={videoNote} environment="embedded" />, container));

            expect(container.querySelector(".media-proxy")).toBeNull();
            const media = mediaElement();
            expect(media?.getAttribute("src")).toBe("api/notes/vid1/open-partial");
            // Embedded is "ready to play", not "playing".
            expect(media?.getAttribute("preload")).toBe("metadata");
            expect(play).not.toHaveBeenCalled();
        });

        it("mounts the standalone player, which may buffer ahead in full", async () => {
            await act(async () => render(<MediaPreview entity={audioNote} environment="standalone" />, container));

            const media = mediaElement();
            expect(media?.tagName).toBe("AUDIO");
            expect(media?.getAttribute("preload")).toBe("auto");
            expect(play).not.toHaveBeenCalled();
        });
    });

    it("picks the player from the mime type and tags the wrapper with its environment", async () => {
        await act(async () => render(<MediaPreview entity={videoNote} environment="embedded" />, container));
        expect(container.querySelector(".video-preview-wrapper.media-env-embedded")).not.toBeNull();

        await act(async () => render(<MediaPreview entity={audioNote} environment="standalone" />, container));
        expect(container.querySelector(".audio-preview-wrapper.media-env-standalone")).not.toBeNull();
    });

    it("hides the folder play mode outside the note detail, where there is no folder to set it on", async () => {
        await act(async () => render(<MediaPreview entity={videoNote} environment="embedded" />, container));
        expect(container.querySelector(".play-mode-dropdown")).toBeNull();
    });

    it("keeps a preview's clicks to itself, so pressing play in a collection card doesn't open the note", async () => {
        // Both the placeholder and the player it becomes opt out of link navigation (see services/link.ts).
        await act(async () => render(<MediaPreview entity={videoNote} environment="preview" />, container));
        expect(container.querySelector(".media-proxy.no-link-navigation")).not.toBeNull();

        await act(async () => proxyPlayButton()?.click());
        expect(container.querySelector(".video-preview-wrapper.no-link-navigation")).not.toBeNull();

        // An embedded player isn't inside a link, and must not suppress navigation.
        await act(async () => render(<MediaPreview entity={videoNote} environment="embedded" />, container));
        expect(container.querySelector(".no-link-navigation")).toBeNull();
    });
});
