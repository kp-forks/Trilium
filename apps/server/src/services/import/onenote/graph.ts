/**
 * Minimal Microsoft Graph client for the OneNote importer. Only the read endpoints needed to
 * enumerate the notebook tree and pull page content are implemented.
 *
 * Graph reference: https://learn.microsoft.com/en-us/graph/api/resources/onenote-api-overview
 */

import { safeFetch } from "../../safe_fetch.js";
import { extractPageId } from "./links.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// safeFetch's default 5s timeout is too tight for the importer: page content and binary resources can
// be large and slow. Allow a generous per-request budget instead.
const GRAPH_TIMEOUT_MS = 60_000;

/**
 * Fetches a Microsoft Graph URL through {@link safeFetch} so the request is hardened against SSRF —
 * pagination (`@odata.nextLink`) and resource URLs come from Graph responses and page HTML, so they
 * must not be trusted to point at the public Graph host. The bearer token is sent on every hop.
 */
function graphFetch(accessToken: string, url: string): Promise<Response> {
    return safeFetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS)
    });
}

export interface GraphAccount {
    name: string;
    email: string;
}

export interface OneNoteSection {
    id: string;
    title: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
}

export interface OneNoteSectionGroup {
    id: string;
    title: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    sections: OneNoteSection[];
    sectionGroups: OneNoteSectionGroup[];
}

export interface OneNoteNotebook {
    id: string;
    title: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    sections: OneNoteSection[];
    sectionGroups: OneNoteSectionGroup[];
}

export interface OneNotePage {
    id: string;
    title: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    /** OneNote's indentation level in the page list: 0 for a top-level page, 1+ for a subpage. */
    level: number;
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
 * Returns the notebooks with their direct sections and a tree of section groups — each group carrying
 * its own sections and nested groups — mirroring the OneNote structure so the importer can recreate it
 * as nested folders.
 *
 * The initial call expands each notebook's sections and whether it has any section groups, so the
 * common case (no section groups) is a single round-trip. Only notebooks/groups that actually contain
 * section groups follow their `sectionGroupsUrl`, and those follow-up requests run in parallel —
 * section groups nest arbitrarily and the notebooks endpoint won't $expand them more than one level.
 */
export async function listNotebooks(accessToken: string): Promise<OneNoteNotebook[]> {
    const url = "/me/onenote/notebooks?$select=id,displayName,createdDateTime,lastModifiedDateTime,sectionGroupsUrl&$expand=sections($select=id,displayName,createdDateTime,lastModifiedDateTime),sectionGroups($select=id)&$orderby=displayName";
    const notebooks = await graphGetAll<RawNotebook>(accessToken, url);

    return Promise.all(
        notebooks.map(async (notebook) => ({
            id: notebook.id,
            title: notebook.displayName,
            createdDateTime: notebook.createdDateTime,
            lastModifiedDateTime: notebook.lastModifiedDateTime,
            sections: mapSections(notebook.sections),
            sectionGroups: notebook.sectionGroups?.length && notebook.sectionGroupsUrl ? await fetchSectionGroups(accessToken, notebook.sectionGroupsUrl) : []
        }))
    );
}

/**
 * Fetches the section groups under `sectionGroupsUrl` (a notebook's or section group's link) as a tree,
 * each group carrying its own sections and nested groups. Sibling groups are fetched in parallel, and a
 * further round-trip happens only for groups that actually have nested groups.
 */
async function fetchSectionGroups(accessToken: string, sectionGroupsUrl: string): Promise<OneNoteSectionGroup[]> {
    const url = appendQuery(sectionGroupsUrl, "$select=id,displayName,createdDateTime,lastModifiedDateTime,sectionGroupsUrl&$expand=sections($select=id,displayName,createdDateTime,lastModifiedDateTime),sectionGroups($select=id)");
    const groups = await graphGetAll<RawSectionGroup>(accessToken, url);

    return Promise.all(
        groups.map(async (group) => ({
            id: group.id,
            title: group.displayName,
            createdDateTime: group.createdDateTime,
            lastModifiedDateTime: group.lastModifiedDateTime,
            sections: mapSections(group.sections),
            sectionGroups: group.sectionGroups?.length && group.sectionGroupsUrl ? await fetchSectionGroups(accessToken, group.sectionGroupsUrl) : []
        }))
    );
}

function mapSections(raw: RawSection[] | undefined): OneNoteSection[] {
    return (raw ?? []).map((s) => ({ id: s.id, title: s.displayName, createdDateTime: s.createdDateTime, lastModifiedDateTime: s.lastModifiedDateTime }));
}

function appendQuery(url: string, query: string): string {
    return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
}

export async function listPages(accessToken: string, sectionId: string): Promise<OneNotePage[]> {
    // `links` carries the page's own `onenote:` client URL, from which we recover the page-id GUID that
    // cross-page links reference (see links.ts).
    const url = `/me/onenote/sections/${sectionId}/pages?$select=id,title,createdDateTime,lastModifiedDateTime,level,links&$orderby=order&pagelevel=true`;
    const raw = await graphGetAll<RawPage>(accessToken, url);
    return raw.map((p) => ({
        id: p.id,
        title: p.title || "Untitled",
        createdDateTime: p.createdDateTime,
        lastModifiedDateTime: p.lastModifiedDateTime,
        level: p.level ?? 0,
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
    const response = await graphFetch(accessToken, `${GRAPH_BASE}/me/onenote/pages/${pageId}/content?includeInkML=true`);
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
    const response = await graphFetch(accessToken, url);
    if (!response.ok) {
        throw new Error(`Failed to fetch OneNote resource (HTTP ${response.status})`);
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    return { content: buffer, contentType: response.headers.get("content-type") ?? "application/octet-stream" };
}

interface RawSection {
    id: string;
    displayName: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
}

interface RawNotebook {
    id: string;
    displayName: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    sectionGroupsUrl?: string;
    sections?: RawSection[];
    /** id-only, requested just to detect whether the notebook has section groups to follow. */
    sectionGroups?: { id: string }[];
}

interface RawSectionGroup {
    id: string;
    displayName: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    sectionGroupsUrl?: string;
    sections?: RawSection[];
    /** id-only, requested just to detect whether the group has nested section groups to follow. */
    sectionGroups?: { id: string }[];
}

interface RawPage {
    id: string;
    title?: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    level?: number;
    links?: { oneNoteClientUrl?: { href?: string } };
}

async function graphGet<T>(accessToken: string, path: string): Promise<T> {
    const response = await graphFetch(accessToken, `${GRAPH_BASE}${path}`);
    if (!response.ok) {
        throw new Error(`Microsoft Graph request failed: ${path} (HTTP ${response.status})`);
    }
    return response.json() as Promise<T>;
}

/** GETs a Graph collection endpoint, following @odata.nextLink pagination. */
async function graphGetAll<T>(accessToken: string, pathOrUrl: string): Promise<T[]> {
    const results: T[] = [];
    let next: string | null = pathOrUrl.startsWith("http") ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;

    while (next) {
        const response: Response = await graphFetch(accessToken, next);
        if (!response.ok) {
            throw new Error(`Microsoft Graph request failed: ${pathOrUrl} (HTTP ${response.status})`);
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
