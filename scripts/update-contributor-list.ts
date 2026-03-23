import { Contributor, ContributorList } from "../packages/commons/";
import { writeFileSync } from "fs";

// Keep honorific contributors at top of the list, even if their commit count
// is exceeded by another users.
const PINNED_CONTRIBUTORS: Record<string, Pick<Contributor, "fullName" | "role">> = {
    "eliandoran": {fullName: "Elian Doran", role: "lead-dev"},
    "zadam": {fullName: "Zadam", role: "original-dev"}
};

// Bots marked as users on the GitHub profile info to exclude from the listing
const BOTS = [
    "weblate"
];

async function main() {
    console.log("Retrieving the contributor list...");

    let data: any = {};
    try {
        data = await fetchContributors();
    } catch (ex) {
        console.error(ex);
        return;
    }

    writeFileSync("contributors.json", JSON.stringify(data, null, 4));
    console.log("Done.");
}

async function fetchContributors() {
    const response = await fetch("https://api.github.com/repos/TriliumNext/Trilium/contributors");

    if (response.ok) {
        return {
            "⚠️": "NOTE: this is an auto-generated list. Do not modify it.",
            contributors: processContributorList(await response.json())
        } as ContributorList
    } else {
        throw new Error(`Unable to request the contributor list from GitHub. Reason: ${response.statusText}`);
    }
}

function processContributorList(contributorInfo: GithubContributor[]) {
    return contributorInfo
        // Filter out bots
        .filter((c) => c.type === "User" && !BOTS.includes(c.login))
        // Sort by the commit count. Honorific contributors are always first.
        .sort(contributorOrderer)
        .map((c) => {
            let pinnedInfo = PINNED_CONTRIBUTORS[c.login];

            return {
                name: c.login,
                fullName: pinnedInfo?.fullName,
                url: c.html_url,
                role: pinnedInfo?.role
            } as Contributor;
        });
}

function contributorOrderer(a, b) {
    const isAPinned = (a.login in PINNED_CONTRIBUTORS);
    const isBPinned = (b.login in PINNED_CONTRIBUTORS);
    
    // Pinned contributors come first
    if (isAPinned !== isBPinned) {
        return isAPinned ? -1 : 1;
    }
    
    // Within each group, sort by contributions
    return b.contributions - a.contributions;
}

main();