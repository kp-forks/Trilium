export interface ContributorList {
    contributors: Contributor[];
}

export interface Contributor {
    name: string;
    url: string;
}

export default async function getContributors() {
    const response = await fetch("https://api.github.com/repos/TriliumNext/Trilium/contributors");

    if (response.ok) {
        return {
            contributors: getList(await response.json())
        } as ContributorList
    } else {
        throw new Error(`Unable to request the contributor list from GitHub. Reason: ${response.statusText}`);
    }
}

function getList(contributorInfo: any[]) {
    return contributorInfo
        .filter((c) => c.type === "User" && c.user_view_type === "public")
        .sort((a, b) => b.contributions - a.contributions)
        .map((c) => {return {
            name: c.login,
            url: c.html_url
        } as Contributor});
}