/**
 * Minimal Microsoft Graph client for the OneNote importer. Only the read endpoints needed to
 * enumerate the notebook tree and pull page content are implemented.
 *
 * Graph reference: https://learn.microsoft.com/en-us/graph/api/resources/onenote-api-overview
 */

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
    const url = `/me/onenote/sections/${sectionId}/pages?$select=id,title,createdDateTime,lastModifiedDateTime&$orderby=order&pagelevel=true`;
    const raw = await graphGetAll<RawPage>(accessToken, url);
    return raw.map((p) => ({
        id: p.id,
        title: p.title || "Untitled",
        createdDateTime: p.createdDateTime,
        lastModifiedDateTime: p.lastModifiedDateTime
    }));
}

/** Returns the raw HTML body of a page (a full HTML document as produced by the OneNote API). */
export async function getPageContent(accessToken: string, pageId: string): Promise<string> {
    const response = await fetch(`${GRAPH_BASE}/me/onenote/pages/${pageId}/content`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch OneNote page content (HTTP ${response.status})`);
    }
    return response.text();
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
    getPageContent
};
