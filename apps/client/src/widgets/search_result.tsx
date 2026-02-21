import "./search_result.css";

import clsx from "clsx";
import { useEffect, useState } from "preact/hooks";

import froca from "../services/froca";
import { t } from "../services/i18n";
import toast from "../services/toast";
import { getErrorMessage } from "../services/utils";
import { SearchNoteList } from "./collections/NoteList";
import Button from "./react/Button";
import { useNoteContext,  useTriliumEvent } from "./react/hooks";
import NoItems from "./react/NoItems";

enum SearchResultState {
    NO_RESULTS,
    NOT_EXECUTED,
    GOT_RESULTS
}

export default function SearchResult() {
    const { note, notePath, ntxId, parentComponent } = useNoteContext();
    const [ state, setState ] = useState<SearchResultState>();
    const [ highlightedTokens, setHighlightedTokens ] = useState<string[]>();

    function refresh() {
        if (note?.type !== "search") {
            setState(undefined);
        } else if (!note?.searchResultsLoaded) {
            setState(SearchResultState.NOT_EXECUTED);
        } else if (note.getChildNoteIds().length === 0) {
            setState(SearchResultState.NO_RESULTS);
        } else {
            setState(SearchResultState.GOT_RESULTS);
            setHighlightedTokens(note.highlightedTokens);
        }
    }

    useEffect(() => refresh(), [ note ]);
    useTriliumEvent("searchRefreshed", ({ ntxId: eventNtxId }) => {
        if (eventNtxId === ntxId) {
            refresh();
        }
    });
    useTriliumEvent("notesReloaded", ({ noteIds }) => {
        if (note?.noteId && noteIds.includes(note.noteId)) {
            refresh();
        }
    });

    return (
        <div className={clsx("search-result-widget", state === undefined && "hidden-ext")}>
            {state === SearchResultState.NOT_EXECUTED && (
                <NoItems icon="bx bx-file-find" text={t("search_result.search_not_executed")}>
                    <Button
                        text="Search now"
                        onClick={async () => {
                            if (!note) return;
                            try {
                                const result = await froca.loadSearchNote(note.noteId);
                                if (result?.error) {
                                    toast.showError(result.error);
                                }

                                parentComponent?.triggerEvent("searchRefreshed", { ntxId });
                            } catch (e) {
                                toast.showError(getErrorMessage(e));
                            }
                        }}
                    />
                </NoItems>
            )}

            {state === SearchResultState.NO_RESULTS && (
                <NoItems icon="bx bx-rectangle" text={t("search_result.no_notes_found")} />
            )}

            {state === SearchResultState.GOT_RESULTS && (
                <SearchNoteList
                    media="screen"
                    note={note}
                    notePath={notePath}
                    highlightedTokens={highlightedTokens}
                    ntxId={ntxId}
                />
            )}
        </div>
    );
}
