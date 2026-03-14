import type { NoteContentTemplate } from "../../layout/NoteContentSwitcher";

const SAMPLE_DIAGRAMS: NoteContentTemplate[] = [
    {
        name: "Flowchart",
        content: `\
flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]
`
    }
];

export default SAMPLE_DIAGRAMS;
