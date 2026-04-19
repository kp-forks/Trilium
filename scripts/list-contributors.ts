import { execSync} from "node:child_process";

interface ContributorInfo {
    name: string;
    fullName?: string
    email?: string;
    commitCount: number;
    translationCommitCount?: number;
    role?: string;
    url?: string;
}

interface showTableParams {
    title: string;
    comment?: string;
    contributors: ContributorInfo[];
    columns: (keyof ContributorInfo)[];
}

async function main() {
    listLocalGitContributors();
    await listGitHubContributors();
}

async function listGitHubContributors() {
    let list: any[] | null = null;
    
    const response = await fetch("https://api.github.com/repos/TriliumNext/Trilium/contributors");
    if (response.ok) {
        list = await response.json();
    } else {
        console.error(`Unable to request the contributor list from GitHub. Reason: ${response.statusText}`);
    }

    if (!list) {
        return;
    }

    const MIN_CONTRIBUTIONS = 125;
    const contributors: ContributorInfo[] = list
        .filter((c) => c.contributions >= MIN_CONTRIBUTIONS)
        .map((c) => {
            return {
                name: c.login,
                url: c.html_url,
                commitCount: c.contributions
            } as ContributorInfo;
        });

    showTable({
        title: "GitHub Contributor List",
        comment: "Note: the GitHub list also include contributors that did not directly contribute to Trilium, but to submodules used in the Trilium's repo.",
        contributors: contributors,
        columns: ["name", "url", "commitCount"]
    });
}

const TRANSLATION_PATHS = [
    "apps/client/src/translations/",
    "apps/server/src/assets/translations/"
];

/** Authors that are bots or automated tools, not real contributors. */
const EXCLUDED_AUTHORS = new Set([
    "Languages add-on",
    "Hosted Weblate",
    "renovate[bot]"
]);

function parseShortlog(rawOutput: string): Map<string, { email: string; commitCount: number }> {
    const result = new Map<string, { email: string; commitCount: number }>();
    for (const line of rawOutput.split("\n")) {
        const match = line.match(/^\s*(\d+)\s+(.+?)\s+<(.+)>$/);
        if (match) {
            result.set(match[2], { email: match[3], commitCount: parseInt(match[1]) });
        }
    }
    return result;
}

function listLocalGitContributors() {
    const allOutput = execSync("git shortlog -sne --no-merges HEAD -- src/ apps/").toString();
    const translationOutput = execSync(`git shortlog -sne --no-merges HEAD -- ${TRANSLATION_PATHS.join(" ")}`).toString();

    const allContribs = parseShortlog(allOutput);
    const translationContribs = parseShortlog(translationOutput);

    const developers: ContributorInfo[] = [];
    const translators: ContributorInfo[] = [];
    let rank = 0;
    for (const [name, { email, commitCount }] of allContribs) {
        if (EXCLUDED_AUTHORS.has(name)) continue;
        if (++rank > 20) break;

        const translationCommitCount = translationContribs.get(name)?.commitCount ?? 0;
        const isTranslator = translationCommitCount > commitCount * 0.5;

        const entry: ContributorInfo = { name, email, commitCount };

        if (isTranslator) {
            translators.push(entry);
        } else {
            developers.push(entry);
        }
    }

    showTable({
        title: "Local Git Contributors (Developers)",
        comment: "",
        columns: ["name", "email", "commitCount"],
        contributors: developers
    });

    showTable({
        title: "Local Git Contributors (Translators)",
        comment: "Contributors where >50% of commits are to translation files.",
        columns: ["name", "email", "commitCount"],
        contributors: translators
    });
}

function showTable(params: showTableParams) {
    console.log(`\n──── ${params.title} ────`);
    if (params.comment) {
        console.log(`\n${params.comment}\n`);
    }
    console.table(params.contributors, params.columns);
}

main();