import { execSync} from "node:child_process";

interface ContributorInfo {
    name: string;
    fullName?: string
    email?: string;
    commitCount: number;
    url: string;
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

    const contributors: ContributorInfo[] = list.map((c) => {
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

function listLocalGitContributors() {
    const rawOutput = execSync("git shortlog -sne --no-merges HEAD -- src/ apps/")
        .toString()
        .split("\n")
        .slice(0, 20);
    
    const contributors: ContributorInfo[] = rawOutput.map((line: string) => {
        const match = line.match(/^\s*(\d+)\s+(.+?)\s+<(.+)>$/);
        if (!match) {
            return null;
        }
        return {
            name: match[2],
            email: match[3],
            commitCount: parseInt(match[1])
        }
    });

    showTable({
        title: "Local Git Contributor List",
        comment: "",
        columns: ["name", "email", "commitCount"],
        contributors: contributors.filter((c: ContributorInfo | null) => c !== null)
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