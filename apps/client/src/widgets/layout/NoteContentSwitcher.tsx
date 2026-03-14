import "./NoteContentSwitcher.css";

import { Badge } from "../react/Badge";

export interface NoteContentTemplate {
    name: string;
    content: string;
}

interface NoteContentSwitcherProps {
    templates: NoteContentTemplate[];
}

export default function NoteContentSwitcher({ templates }: NoteContentSwitcherProps) {
    return (
        <div className="note-content-switcher">
            {templates.map(sample => (
                <Badge
                    key={sample.name}
                    text={sample.name}
                />
            ))}
        </div>
    );
}
