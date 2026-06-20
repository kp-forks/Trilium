/**
 * Minimal Microsoft Graph client for the OneNote importer. Only the read endpoints needed to
 * enumerate the notebook tree and pull page content are implemented.
 *
 * Graph reference: https://learn.microsoft.com/en-us/graph/api/resources/onenote-api-overview
 */

import { extractPageId } from "./links.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface GraphAccount {
    name: string;
    email: string;
}

export interface OneNoteSection {
    id: string;
    title: string;
}

export interface OneNoteNotebook {
    id: string;
    title: string;
    sections: OneNoteSection[];
}

export interface OneNotePage {
    id: string;
    title: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    /** The page-id GUID OneNote uses in `onenote:` links to this page; used to resolve cross-page links. */
    pageId?: string;
}

export async function getAccount(accessToken: string): Promise<GraphAccount> {
    const me = await graphGet<{ displayName?: string; mail?: string; userPrincipalName?: string }>(accessToken, "/me");
    return {
        name: me.displayName ?? me.userPrincipalName ?? "Unknown",
        email: me.mail ?? me.userPrincipalName ?? ""
    };
}

/**
 * Returns the notebooks with their sections. Sections nested inside section groups are flattened
 * into the owning notebook with a "Group / Section" title — good enough for a first import pass.
 */
export async function listNotebooks(accessToken: string): Promise<OneNoteNotebook[]> {
    const url = "/me/onenote/notebooks?$select=id,displayName&$expand=sections($select=id,displayName),sectionGroups($expand=sections($select=id,displayName))&$orderby=displayName";
    const raw = await graphGetAll<RawNotebook>(accessToken, url);

    return raw.map((notebook) => {
        const sections: OneNoteSection[] = (notebook.sections ?? []).map((s) => ({ id: s.id, title: s.displayName }));
        for (const group of notebook.sectionGroups ?? []) {
            for (const s of group.sections ?? []) {
                sections.push({ id: s.id, title: `${group.displayName} / ${s.displayName}` });
            }
        }
        return { id: notebook.id, title: notebook.displayName, sections };
    });
}

export async function listPages(accessToken: string, sectionId: string): Promise<OneNotePage[]> {
    // `links` carries the page's own `onenote:` client URL, from which we recover the page-id GUID that
    // cross-page links reference (see links.ts).
    const url = `/me/onenote/sections/${sectionId}/pages?$select=id,title,createdDateTime,lastModifiedDateTime,links&$orderby=order&pagelevel=true`;
    const raw = await graphGetAll<RawPage>(accessToken, url);
    return raw.map((p) => ({
        id: p.id,
        title: p.title || "Untitled",
        createdDateTime: p.createdDateTime,
        lastModifiedDateTime: p.lastModifiedDateTime,
        pageId: extractPageId(p.links?.oneNoteClientUrl?.href) ?? undefined
    }));
}

/**
 * Returns a page's content, split into its HTML body and (optional) InkML.
 *
 * We request `includeInkML=true` so handwriting/drawings — which the default HTML output drops,
 * leaving only `<!-- InkNode is not supported -->` comments — come back as a separate InkML part. With
 * that flag the response is a MIME multipart envelope (one `text/html` part, one
 * `application/inkml+xml` part), which parsePageContent splits apart. Pages without ink may still come
 * back as plain HTML, which the parser handles by returning the whole body as `html`.
 */
export async function getPageContent(accessToken: string, pageId: string): Promise<{ html: string; inkml: string }> {
    const response = await fetch(`${GRAPH_BASE}/me/onenote/pages/${pageId}/content?includeInkML=true`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch OneNote page content (HTTP ${response.status})`);
    }
    return parsePageContent(await response.text());
}

/**
 * Splits a OneNote page response into its HTML and InkML parts. A page fetched with
 * `includeInkML=true` comes back as a MIME multipart body whose first line is the boundary; each part
 * carries header lines (including `Content-Type`), then a blank line, then the body. A non-multipart
 * response (no leading `--` boundary) is returned verbatim as the HTML part.
 */
export function parsePageContent(raw: string): { html: string; inkml: string } {
    const normalized = raw.replace(/\r\n/g, "\n");
    const boundary = normalized.slice(0, normalized.indexOf("\n")).trim();
    if (!boundary.startsWith("--")) {
        return { html: raw.trim(), inkml: "" };
    }

    let html = "";
    let inkml = "";
    for (const part of normalized.split(boundary)) {
        const separator = part.indexOf("\n\n");
        if (separator < 0) {
            continue;
        }
        const headers = part.slice(0, separator).toLowerCase();
        const body = part.slice(separator + 2).trim();
        if (headers.includes("text/html")) {
            html = body;
        } else if (headers.includes("application/inkml+xml")) {
            inkml = body;
        }
    }
    return { html, inkml };
}

/**
 * Downloads a binary resource (image or file attachment) referenced from page HTML. The URL is an
 * absolute Graph `…/resources/{id}/$value` link, so it is fetched directly rather than relative to the
 * API base. Returns the raw bytes plus the server-reported content type.
 */
export async function getResource(accessToken: string, url: string): Promise<{ content: Uint8Array; contentType: string }> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
        throw new Error(`Failed to fetch OneNote resource (HTTP ${response.status})`);
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    return { content: buffer, contentType: response.headers.get("content-type") ?? "application/octet-stream" };
}

interface RawNotebook {
    id: string;
    displayName: string;
    sections?: { id: string; displayName: string }[];
    sectionGroups?: { displayName: string; sections?: { id: string; displayName: string }[] }[];
}

interface RawPage {
    id: string;
    title?: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    links?: { oneNoteClientUrl?: { href?: string } };
}

async function graphGet<T>(accessToken: string, path: string): Promise<T> {
    const response = await fetch(`${GRAPH_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
        throw new Error(`Microsoft Graph request failed: ${path} (HTTP ${response.status})`);
    }
    return response.json() as Promise<T>;
}

/** GETs a Graph collection endpoint, following @odata.nextLink pagination. */
async function graphGetAll<T>(accessToken: string, path: string): Promise<T[]> {
    const results: T[] = [];
    let next: string | null = `${GRAPH_BASE}${path}`;

    while (next) {
        const response: Response = await fetch(next, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!response.ok) {
            throw new Error(`Microsoft Graph request failed: ${path} (HTTP ${response.status})`);
        }
        const json = (await response.json()) as { value?: T[]; "@odata.nextLink"?: string };
        results.push(...(json.value ?? []));
        next = json["@odata.nextLink"] ?? null;
    }

    return results;
}

export default {
    getAccount,
    listNotebooks,
    listPages,
    getPageContent,
    getResource
};
