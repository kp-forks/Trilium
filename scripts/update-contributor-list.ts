import { writeFileSync } from "fs";

import {Contributor, ContributorList} from "../packages/commons/";

// Keep honorific contributors at top of the list, even if their commit count
// is exceeded by another users.
const PINNED_CONTRIBUTORS: Record<string, Pick<Contributor, "fullName" | "role">> = {
    "eliandoran": {fullName: "Elian Doran", role: "lead-dev"},
    "zadam": {fullName: "Zadam", role: "original-dev"}
};

// Bots marked as users on the GitHub profile info to exclude from the listing
const BOTS = ["weblate"];

async function main() {
    console.log("Retrieving the contributor list...");

    let jsonData: any = {};
    try {
        jsonData = await getContributors();
    } catch (ex) {
        console.error(ex);
        return;
    }

    writeFileSync("contributors.json", JSON.stringify(jsonData, null, 2));
    console.log("Done.");
}

async function getContributors() {
    const response = await fetch("https://api.github.com/repos/TriliumNext/Trilium/contributors");

    if (response.ok) {
        return {
            "⚠️": "NOTE: this is an auto-generated list. Do not modify it.",
            contributors: getList(await response.json())
        } as ContributorList
    } else {
        throw new Error(`Unable to request the contributor list from GitHub. Reason: ${response.statusText}`);
    }
}

function getList(contributorInfo: any[]) {
    return contributorInfo
        // Filter out bots
        .filter((c) => c.type === "User" && !BOTS.includes(c.login))
        // Sort by the commit count. Honorific contributors are always first.
        .sort(contributorOrderer)
        .map((c) => {
            let result = {
                name: c.login,
                url: c.html_url
            } as Contributor;

            if (c.login in PINNED_CONTRIBUTORS) {
                result = {...result, ...PINNED_CONTRIBUTORS[c.login]};
            }

            return result;
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