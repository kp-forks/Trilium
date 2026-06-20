import { describe, expect, it } from "vitest";

import { buildSectionSelections, type OneNoteNotebook } from "./onenote_import.js";

const NOTEBOOKS: OneNoteNotebook[] = [
    {
        id: "nb1",
        title: "Notebook 1",
        createdDateTime: "2020-01-01T00:00:00Z",
        lastModifiedDateTime: "2020-02-01T00:00:00Z",
        sections: [{ id: "s1", title: "Direct section" }],
        sectionGroups: [
            {
                id: "g1",
                title: "Group A",
                createdDateTime: "2020-03-01T00:00:00Z",
                lastModifiedDateTime: "2020-04-01T00:00:00Z",
                sections: [{ id: "s2", title: "In group A" }],
                sectionGroups: [
                    {
                        id: "g2",
                        title: "Subgroup B",
                        sections: [{ id: "s3", title: "In subgroup B" }],
                        sectionGroups: []
                    }
                ]
            }
        ]
    }
];

describe("buildSectionSelections", () => {
    it("returns a top-level section with an empty group path and its notebook metadata", () => {
        const [selection, ...rest] = buildSectionSelections(NOTEBOOKS, new Set(["s1"]));
        expect(rest).toHaveLength(0);
        expect(selection).toMatchObject({
            id: "s1",
            title: "Direct section",
            groupPath: [],
            notebookId: "nb1",
            notebookTitle: "Notebook 1",
            notebookCreatedDateTime: "2020-01-01T00:00:00Z",
            notebookLastModifiedDateTime: "2020-02-01T00:00:00Z"
        });
    });

    it("carries the section-group ancestry (outermost first) for nested sections", () => {
        const inGroup = buildSectionSelections(NOTEBOOKS, new Set(["s2"]));
        expect(inGroup[0].groupPath).toEqual([
            { id: "g1", title: "Group A", createdDateTime: "2020-03-01T00:00:00Z", lastModifiedDateTime: "2020-04-01T00:00:00Z" }
        ]);

        const inSubgroup = buildSectionSelections(NOTEBOOKS, new Set(["s3"]));
        expect(inSubgroup[0].groupPath.map((g) => g.id)).toEqual(["g1", "g2"]);
    });

    it("emits selected sections in tree order and ignores unselected ones", () => {
        const selections = buildSectionSelections(NOTEBOOKS, new Set(["s3", "s1"]));
        expect(selections.map((s) => s.id)).toEqual(["s1", "s3"]);

        expect(buildSectionSelections(NOTEBOOKS, new Set())).toEqual([]);
        expect(buildSectionSelections(NOTEBOOKS, new Set(["does-not-exist"]))).toEqual([]);
    });
});
