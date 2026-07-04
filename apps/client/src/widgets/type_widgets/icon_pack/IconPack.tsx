import "./IconPack.css";

import { useEffect, useMemo, useState } from "preact/hooks";

import FNote from "../../../entities/fnote";
import { t } from "../../../services/i18n";
import { isDesktop } from "../../../services/utils";
import { useNoteBlob, useNoteLabel } from "../../react/hooks";
import IsolatedFrame from "../../react/IsolatedFrame";
import NoItems from "../../react/NoItems";
import { TextPreview } from "../File";
import SplitEditor from "../helpers/SplitEditor";
import { TypeWidgetProps } from "../type_widget";

/** How long to wait after the last edit before re-parsing and re-rendering the (potentially large) preview. */
const PREVIEW_DEBOUNCE_MS = 1500;

/** Theme variables forwarded into the isolated preview frame so it matches the app's colours. */
const PREVIEW_CSS_VARS = [
    "--main-text-color",
    "--main-background-color",
    "--muted-text-color",
    "--main-border-color",
    "--accented-background-color",
    "--hover-item-background-color"
];

export default function IconPack(props: TypeWidgetProps) {
    const [ content, setContent ] = useState("");
    // Icon packs shipped in distributable zips are `file` notes, whose content isn't editable as
    // text and can be large — show a read-only, truncated source pane (no CodeMirror). Manually
    // created `code` notes stay editable in the normal code editor.
    const isFileNote = props.note.type === "file";
    return (
        <SplitEditor
            noteType="code"
            {...props}
            forceReadOnly={isFileNote}
            onContentChanged={setContent}
            editorContent={isFileNote ? <FileSource note={props.note} /> : undefined}
            previewContent={<IconPackPreview note={props.note} content={content} />}
            forceOrientation={isDesktop() ? "horizontal" : "vertical"}
        />
    );
}

function FileSource({ note }: { note: FNote }) {
    const blob = useNoteBlob(note);
    // `TextPreview` renders the alert and the `<pre>` as siblings; wrap them so the split editor
    // pane has a single flow child and doesn't break its layout.
    return (
        <div className="icon-pack-file-source">
            <TextPreview content={blob?.content ?? ""} />
        </div>
    );
}

function IconPackPreview({ note, content }: { note: FNote; content: string }) {
    const [ prefix ] = useNoteLabel(note, "iconPack");
    // The user isn't meant to see the preview update on every keystroke — it lags a beat behind.
    const debounced = useDebouncedValue(content, PREVIEW_DEBOUNCE_MS);
    const font = useIconPackFont(note);

    const parsed = useMemo(() => parseManifest(debounced), [ debounced ]);
    const css = useMemo(() => buildPreviewCss(font), [ font ]);

    if (!parsed.ok) {
        return <div className="icon-pack-preview"><NoItems icon="bx bx-error-circle" text={t("icon_pack.invalid_manifest")} /></div>;
    }
    // Empty content means the manifest hasn't been loaded/typed yet — stay blank rather than flashing
    // the "no icons" state before the real content arrives.
    if (!debounced.trim()) {
        return <div className="icon-pack-preview" />;
    }
    if (!parsed.icons.length) {
        return <div className="icon-pack-preview"><NoItems icon="bx bx-images" text={t("icon_pack.no_icons")} /></div>;
    }

    return (
        <IsolatedFrame className="icon-pack-frame" title={t("icon_pack.preview_title")} css={css} cssVars={PREVIEW_CSS_VARS}>
            <div className="ip-grid">
                {parsed.icons.map((icon) => (
                    <div className="ip-cell" key={icon.id} title={iconTooltip(prefix, icon)}>
                        <span className="ip-glyph">{icon.glyph}</span>
                    </div>
                ))}
            </div>
        </IsolatedFrame>
    );
}

interface PreviewIcon {
    id: string;
    glyph: string;
    terms: string[];
}

/** Builds the hover tooltip: the usable CSS class, the glyph's escaped code point, and the search terms. */
function iconTooltip(prefix: string | null | undefined, icon: PreviewIcon): string {
    const cssClass = prefix ? `${prefix} ${icon.id}` : icon.id;
    const codePoint = icon.glyph.codePointAt(0);
    const code = codePoint != null ? `\\${codePoint.toString(16)}` : "";
    return t("icon_pack.tooltip", { class: cssClass, code, terms: icon.terms.join(", ") });
}

type ParsedManifest =
    | { ok: true; icons: PreviewIcon[] }
    | { ok: false };

function parseManifest(content: string): ParsedManifest {
    if (!content.trim()) return { ok: true, icons: [] };

    let data: unknown;
    try {
        data = JSON.parse(content);
    } catch {
        return { ok: false };
    }

    const rawIcons = (data as { icons?: unknown })?.icons;
    if (!rawIcons || typeof rawIcons !== "object") return { ok: false };

    const icons = Object.entries(rawIcons as Record<string, unknown>).map(([ id, value ]) => {
        const entry = value as { glyph?: unknown; terms?: unknown };
        const glyph = typeof entry?.glyph === "string" ? resolveGlyph(entry.glyph) : "";
        const terms = Array.isArray(entry?.terms) ? entry.terms.filter((term): term is string => typeof term === "string") : [];
        return { id, glyph, terms };
    });
    return { ok: true, icons };
}

/**
 * Returns the actual glyph character. Some manifests store the glyph as a literal escape string
 * (e.g. a CSS-style escape) rather than the real character; those are converted to their code
 * point. A value that is already a real character is returned unchanged.
 */
function resolveGlyph(raw: string): string {
    const match = raw.match(/^\\u?([0-9a-fA-F]{2,6})$/);
    if (match) {
        const codePoint = parseInt(match[1], 16);
        if (!Number.isNaN(codePoint)) return String.fromCodePoint(codePoint);
    }
    return raw;
}

/** MIME types recognised as icon-pack fonts, in the same order of preference the server uses. */
const FONT_MIME_TO_FORMAT: Record<string, string> = {
    "font/woff2": "woff2",
    "font/woff": "woff",
    "font/ttf": "truetype"
};

interface IconPackFont {
    url: string;
    format: string;
}

/** Resolves the best font attachment on the note to an absolute download URL, mirroring the server's selection. */
function useIconPackFont(note: FNote): IconPackFont | null {
    const [ font, setFont ] = useState<IconPackFont | null>(null);
    useEffect(() => {
        let cancelled = false;
        note.getAttachmentsByRole("file").then((attachments) => {
            if (cancelled) return;
            const best = Object.keys(FONT_MIME_TO_FORMAT)
                .map((mime) => attachments.find((attachment) => attachment.mime === mime))
                .find(Boolean);
            // Resolve against the host document's base URL since the isolated frame has none.
            setFont(best
                ? { url: new URL(`api/attachments/download/${best.attachmentId}`, document.baseURI).href, format: FONT_MIME_TO_FORMAT[best.mime] }
                : null);
        }).catch(() => {
            if (!cancelled) setFont(null);
        });
        return () => { cancelled = true; };
    }, [ note ]);
    return font;
}

const PREVIEW_FONT_FAMILY = "tn-icon-pack-preview";

function buildPreviewCss(font: IconPackFont | null): string {
    const fontFace = font
        ? `@font-face { font-family: "${PREVIEW_FONT_FAMILY}"; src: url("${font.url}") format("${font.format}"); font-display: block; }`
        : "";
    return `
        ${fontFace}
        html, body { margin: 0; height: 100%; }
        body {
            color: var(--main-text-color, #000);
            background: var(--main-background-color, #fff);
            padding: 8px;
            box-sizing: border-box;
            overflow: auto;
        }
        .ip-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, 32px);
            gap: 8px;
            justify-content: start;
        }
        .ip-cell {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 8px;
            border-radius: 4px;
            cursor: default;
            /* Skip layout/paint for off-screen cells so large packs stay responsive. */
            content-visibility: auto;
            contain-intrinsic-size: 32px 32px;
        }
        .ip-cell:hover { background: var(--hover-item-background-color, rgba(127, 127, 127, 0.2)); }
        .ip-glyph { font-family: "${PREVIEW_FONT_FAMILY}"; font-size: 32px; line-height: 1; }
    `;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [ debounced, setDebounced ] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [ value, delayMs ]);
    return debounced;
}
