import "./Render.css";

import { useEffect, useRef } from "preact/hooks";

import attributes from "../../services/attributes";
import { t } from "../../services/i18n";
import render from "../../services/render";
import FormGroup from "../react/FormGroup";
import { useNoteRelation, useTriliumEvent } from "../react/hooks";
import NoteAutocomplete from "../react/NoteAutocomplete";
import { refToJQuerySelector } from "../react/react_utils";
import SetupForm from "./helpers/SetupForm";
import { TypeWidgetProps } from "./type_widget";

export default function Render(props: TypeWidgetProps) {
    const { note } = props;
    const [ renderNote ] = useNoteRelation(note, "renderNote");

    if (!renderNote) {
        return <SetupRenderContent {...props} />;
    }

    return <RenderContent {...props} />;
}

function RenderContent({ note, noteContext, ntxId }: TypeWidgetProps) {
    const contentRef = useRef<HTMLDivElement>(null);

    function refresh() {
        if (!contentRef) return;
        render.render(note, refToJQuerySelector(contentRef));
    }

    useEffect(refresh, [ note ]);

    // Keyboard shortcut.
    useTriliumEvent("renderActiveNote", () => {
        if (!noteContext?.isActive()) return;
        refresh();
    });

    // Refresh on floating buttons.
    useTriliumEvent("refreshData", ({ ntxId: eventNtxId }) => {
        if (eventNtxId !== ntxId) return;
        refresh();
    });

    // Refresh on attribute change.
    useTriliumEvent("entitiesReloaded", ({ loadResults }) => {
        if (loadResults.getAttributeRows().some(a => a.type === "relation" && a.name === "renderNote" && attributes.isAffecting(a, note))) {
            refresh();
        }
    });

    // Integration with search.
    useTriliumEvent("executeWithContentElement", ({ resolve, ntxId: eventNtxId }) => {
        if (eventNtxId !== ntxId) return;
        resolve(refToJQuerySelector(contentRef));
    });

    return <div ref={contentRef} className="note-detail-render-content" />;
}

function SetupRenderContent({ note }: TypeWidgetProps) {
    return (
        <SetupForm
            icon="bx bx-extension"
            inAppHelpPage="HcABDtFCkbFN"
        >
            <FormGroup name="render-target-note" label={t("render.setup_title")}>
                <NoteAutocomplete noteIdChanged={noteId => {
                    if (!noteId) return;
                    attributes.setRelation(note.noteId, "renderNote", noteId);
                }} />
            </FormGroup>
        </SetupForm>
    );
}
