import { ComponentChildren } from "preact";

interface NoteContentSwitcherProps {
    children: ComponentChildren;
}

export default function NoteContentSwitcher({ children }: NoteContentSwitcherProps) {
    return <p>{children}</p>;
}
