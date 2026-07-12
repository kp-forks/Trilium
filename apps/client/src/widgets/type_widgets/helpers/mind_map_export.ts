import type { MindElixirInstance } from "mind-elixir";

import { sanitizeNoteContentHtml } from "../../../services/sanitize_content";

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * Renders the mind map to an SVG string for the preview attachment (share pages,
 * include-note, `api/images`) using mind-elixir's native exporter.
 *
 * The native exporter clones the map's SVG layers directly, which makes it orders of
 * magnitude faster than a DOM screenshot library (~7ms vs ~1100ms with snapdom for the
 * demo map, see #10478) — but it has one known gap: labels of arrows ("custom links")
 * and summaries live in an HTML overlay (`.label-container`) rather than in the SVG
 * layers it clones, so they are missing from its output (the reason the preview was
 * previously generated with snapdom). {@link injectSvgLabels} re-adds them.
 *
 * Note that upstream considers `exportSvg()` deprecated in favor of DOM screenshot
 * libraries and will not fix the label gap (see
 * https://github.com/SSShooter/mind-elixir-core/issues/359) — but a screenshot pass is
 * far too slow to run on every save (it once did, via snapdom — see #10478), so Trilium
 * deliberately uses the native exporter everywhere: this helper also feeds the
 * user-triggered SVG/PNG export actions in MindMap.tsx. If a future mind-elixir release
 * removes `exportSvg()` (a loud, type-level break), vendor the exporter instead of
 * switching back to a screenshot library.
 */
export async function renderMindMapPreviewSvg(mind: MindElixirInstance): Promise<string> {
    const svgText = await mind.exportSvg().text();
    return injectSvgLabels(mind, svgText);
}

/**
 * Re-adds the arrow/summary labels missing from mind-elixir's `exportSvg()` output.
 *
 * Labels are absolutely positioned `div.svg-label` elements inside `mind.nodes`
 * (their offset parent is the `position: relative` `me-nodes` element), so their
 * `offsetLeft`/`offsetTop` are in the same coordinate space as the exported SVG
 * layers. Each label is appended to the exporter's inner `<svg>` (the one holding
 * the map layers) as a `<foreignObject>` replicating the label's box and text style.
 *
 * @param mind the live mind map instance the SVG was exported from.
 * @param svgText the output of `mind.exportSvg().text()`.
 * @returns the SVG with the labels injected, or the input unchanged if there are no
 *          labels or it cannot be parsed.
 */
export function injectSvgLabels(mind: MindElixirInstance, svgText: string): string {
    const labels = mind.nodes.querySelectorAll<HTMLElement>(".svg-label");
    if (labels.length === 0) {
        return svgText;
    }

    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    // The exporter produces <svg> [ <rect background>, <svg map layers> ] — label
    // coordinates are relative to the inner svg.
    const contentSvg = doc.documentElement?.querySelector(":scope > svg");
    if (!contentSvg) {
        return svgText;
    }

    for (const label of Array.from(labels)) {
        contentSvg.appendChild(doc.importNode(buildLabelForeignObject(label), true));
    }

    return new XMLSerializer().serializeToString(doc);
}

/**
 * Builds a `<foreignObject>` mirroring an on-screen `.svg-label` element, carrying
 * over its box (position, size, background, border radius) and text styling. Built in
 * the page's document so the label HTML is parsed leniently as HTML; the caller
 * imports it into the SVG document.
 */
function buildLabelForeignObject(label: HTMLElement): SVGElement {
    const style = getComputedStyle(label);

    // The computed width/height carry the fractional used value, but degrade to "auto" when the
    // element is not rendered (e.g. a hidden tab) — fall back to the always-numeric offset size
    // then. Round up so the foreignObject is never narrower than the text it must fit.
    const width = Number.parseFloat(style.width) || label.offsetWidth;
    const height = Number.parseFloat(style.height) || label.offsetHeight;

    const foreignObject = document.createElementNS(SVG_NS, "foreignObject");
    foreignObject.setAttribute("x", String(label.offsetLeft));
    foreignObject.setAttribute("y", String(label.offsetTop));
    foreignObject.setAttribute("width", String(Math.ceil(width)));
    foreignObject.setAttribute("height", String(Math.ceil(height)));

    const div = document.createElementNS(XHTML_NS, "div") as HTMLElement;
    div.setAttribute("style",
        "box-sizing: border-box; width: 100%; height: 100%; " +
        `font-family: ${style.fontFamily}; font-size: ${style.fontSize}; ` +
        `font-weight: ${style.fontWeight}; line-height: ${style.lineHeight}; ` +
        `color: ${style.color}; padding: ${style.padding}; ` +
        `background-color: ${style.backgroundColor}; border-radius: ${style.borderRadius};`);
    div.innerHTML = sanitizeNoteContentHtml(label.innerHTML);

    foreignObject.appendChild(div);
    return foreignObject;
}
