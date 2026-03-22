export interface ContributorList {
    contributors: Contributor[];
}

export interface Contributor {
    name: string;
    url: string;
    role?: "lead-dev" | "original-dev";
}