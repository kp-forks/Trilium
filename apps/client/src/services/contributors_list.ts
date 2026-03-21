export interface ContributorList {
    contributors: Contributor[];
}

export interface Contributor {
    name: string;
    url: string;
}

// Keep honorific contributors at top of the list, even if their commit count
// is exceeded by another users.
const PINNED_CONTRIBUTORS = ["eliandoran", "zadam"];

// Bots marked as users on the GitHub profile info to exclude from the listing
const BOTS = ["weblate"];

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
        // Filter out bots and private profiles
        .filter((c) => c.type === "User" && c.user_view_type === "public" && !BOTS.includes(c.login))
        // Sort by the commit count. Honorific contributors are always first.
        .sort(contributorOrderer)
        .map((c) => {return {
            name: c.login,
            url: c.html_url
        } as Contributor});
}

function contributorOrderer(a, b) {
    const isAPinned = PINNED_CONTRIBUTORS.includes(a.login);
    const isBPinned = PINNED_CONTRIBUTORS.includes(b.login);
    
    // Pinned contributors come first
    if (isAPinned !== isBPinned) {
        return isAPinned ? -1 : 1;
    }
    
    // Within each group, sort by contributions
    return b.contributions - a.contributions;
}