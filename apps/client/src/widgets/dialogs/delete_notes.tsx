import { useRef, useState, useEffect } from "preact/hooks";
import { t } from "../../services/i18n.js";
import FormCheckbox from "../react/FormCheckbox.js";
import Modal from "../react/Modal.js";
import type { DeleteNotesPreview } from "@triliumnext/commons";
import server from "../../services/server.js";
import froca from "../../services/froca.js";
import FNote from "../../entities/fnote.js";
import link from "../../services/link.js";
import Button from "../react/Button.jsx";
import Alert from "../react/Alert.jsx";
import { useTriliumEvent } from "../react/hooks.jsx";

interface CloneInfo {
    totalCloneCount: number;
    clonePaths: string[];
}

export interface ResolveOptions {
    proceed: boolean;
    deleteAllClones?: boolean;
    eraseNotes?: boolean;
}

interface ShowDeleteNotesDialogOpts {
    branchIdsToDelete?: string[];
    callback?: (opts: ResolveOptions) => void;
    forceDeleteAllClones?: boolean;
}

interface BrokenRelationData {
    note: string;
    relation: string;
    source: string;
}

export default function DeleteNotesDialog() {
    const [ opts, setOpts ] = useState<ShowDeleteNotesDialogOpts>({});
    const [ deleteAllClones, setDeleteAllClones ] = useState(false);
    const [ eraseNotes, setEraseNotes ] = useState(!!opts.forceDeleteAllClones);
    const [ brokenRelations, setBrokenRelations ] = useState<DeleteNotesPreview["brokenRelations"]>([]);
    const [ noteIdsToBeDeleted, setNoteIdsToBeDeleted ] = useState<DeleteNotesPreview["noteIdsToBeDeleted"]>([]);
    const [ shown, setShown ] = useState(false);
    const [ cloneInfo, setCloneInfo ] = useState<CloneInfo>({ totalCloneCount: 0, clonePaths: [] });
    const okButtonRef = useRef<HTMLButtonElement>(null);

    useTriliumEvent("showDeleteNotesDialog", (opts) => {
        setOpts(opts);
        setShown(true);
    })

    // Calculate clone information when branches change
    useEffect(() => {
        const { branchIdsToDelete } = opts;
        if (!branchIdsToDelete || branchIdsToDelete.length === 0) {
            setCloneInfo({ totalCloneCount: 0, clonePaths: [] });
            return;
        }

        async function calculateCloneInfo() {
            const branches = froca.getBranches(branchIdsToDelete!, true);
            const uniqueNoteIds = [...new Set(branches.map(b => b.noteId))];
            const notes = await froca.getNotes(uniqueNoteIds);

            let totalCloneCount = 0;
            const clonePaths: string[] = [];

            for (const note of notes) {
                const parentBranches = note.getParentBranches();
                // Clones are additional parent branches beyond the one being deleted
                const otherBranches = parentBranches.filter(b => !branchIdsToDelete!.includes(b.branchId));

                if (otherBranches.length > 0) {
                    totalCloneCount += otherBranches.length;

                    // Get paths for preview (limit to first 5 total)
                    for (const branch of otherBranches) {
                        if (clonePaths.length >= 5) break;
                        const pathHtml = (await link.createLink(note.noteId, {
                            showNotePath: true,
                            referenceLink: false
                        })).html();
                        clonePaths.push(pathHtml);
                    }
                }
            }

            setCloneInfo({ totalCloneCount, clonePaths });
        }

        calculateCloneInfo();
    }, [opts.branchIdsToDelete]);

    useEffect(() => {
        const { branchIdsToDelete, forceDeleteAllClones } = opts;
        if (!branchIdsToDelete || branchIdsToDelete.length === 0) {
            return;
        }

        server.post<DeleteNotesPreview>("delete-notes-preview", {
            branchIdsToDelete,
            deleteAllClones: forceDeleteAllClones || deleteAllClones
        }).then(response => {
            setBrokenRelations(response.brokenRelations);
            setNoteIdsToBeDeleted(response.noteIdsToBeDeleted);
        });
    }, [ opts, deleteAllClones ]);

    return (
        <Modal
            className="delete-notes-dialog"
            size="xl"
            scrollable
            title={t("delete_notes.delete_notes_preview")}
            onShown={() => okButtonRef.current?.focus()}
            onHidden={() => {
                opts.callback?.({ proceed: false })
                setShown(false);
            }}
            footer={<>
                <Button text={t("delete_notes.cancel")}
                    onClick={() => setShown(false)} />
                <Button text={t("delete_notes.ok")} kind="primary"
                    buttonRef={okButtonRef}
                    onClick={() => {
                        opts.callback?.({ proceed: true, deleteAllClones, eraseNotes });
                        setShown(false);
                    }} />
            </>}
            show={shown}
        >
            <DeleteAllClonesOption
                cloneInfo={cloneInfo}
                deleteAllClones={deleteAllClones}
                setDeleteAllClones={setDeleteAllClones}
            />
            <FormCheckbox
                name="erase-notes" label={t("delete_notes.erase_notes_warning")}
                disabled={opts.forceDeleteAllClones}
                currentValue={eraseNotes} onChange={setEraseNotes}
            />

            <DeletedNotes noteIdsToBeDeleted={noteIdsToBeDeleted} />
            <BrokenRelations brokenRelations={brokenRelations} />
        </Modal>
    );
}

function DeletedNotes({ noteIdsToBeDeleted }: { noteIdsToBeDeleted: DeleteNotesPreview["noteIdsToBeDeleted"] }) {
    const [ noteLinks, setNoteLinks ] = useState<string[]>([]);

    useEffect(() => {
        froca.getNotes(noteIdsToBeDeleted).then(async (notes: FNote[]) => {
            const noteLinks: string[] = [];

            for (const note of notes) {
                noteLinks.push((await link.createLink(note.noteId, { showNotePath: true })).html());
            }

            setNoteLinks(noteLinks);
        });
    }, [noteIdsToBeDeleted]);

    if (noteIdsToBeDeleted.length) {
        return (
            <div className="delete-notes-list-wrapper" style={{paddingTop: "16px"}}>
                <h4>{t("delete_notes.notes_to_be_deleted", { notesCount: noteIdsToBeDeleted.length })}</h4>
    
                <ul className="delete-notes-list" style={{ maxHeight: "200px", overflow: "auto"}}>
                    {noteLinks.map((link, index) => (
                        <li key={index} dangerouslySetInnerHTML={{ __html: link }} />
                    ))}
                </ul>
            </div>
        );
    } else {
        return (
            <Alert type="info">
                {t("delete_notes.no_note_to_delete")}
            </Alert>
        )
    }
}

function BrokenRelations({ brokenRelations }: { brokenRelations: DeleteNotesPreview["brokenRelations"] }) {
    const [ notesWithBrokenRelations, setNotesWithBrokenRelations ] = useState<BrokenRelationData[]>([]);

    useEffect(() => {
        const noteIds = brokenRelations
            .map(relation => relation.noteId)
            .filter(noteId => noteId) as string[];
        froca.getNotes(noteIds).then(async () => {
            const notesWithBrokenRelations: BrokenRelationData[] = [];
            for (const attr of brokenRelations) {
                notesWithBrokenRelations.push({
                    note: (await link.createLink(attr.value)).html(),
                    relation: `<code>${attr.name}</code>`,
                    source: (await link.createLink(attr.noteId)).html()
                });
            }
            setNotesWithBrokenRelations(notesWithBrokenRelations);
        });
    }, [brokenRelations]);

    if (brokenRelations.length) {
        return (
            <Alert type="danger" title={t("delete_notes.broken_relations_to_be_deleted", { relationCount: brokenRelations.length })}>
                <ul className="broken-relations-list" style={{ maxHeight: "200px", overflow: "auto" }}>
                    {brokenRelations.map((_, index) => {
                        return (
                            <li key={index}>
                                <span dangerouslySetInnerHTML={{ __html: t("delete_notes.deleted_relation_text", notesWithBrokenRelations[index] as unknown as Record<string, string>) }} />
                            </li>
                        );
                    })}
                </ul>
            </Alert>
        );
    } else {
        return <></>;
    }
}

interface DeleteAllClonesOptionProps {
    cloneInfo: CloneInfo;
    deleteAllClones: boolean;
    setDeleteAllClones: (value: boolean) => void;
}

function DeleteAllClonesOption({ cloneInfo, deleteAllClones, setDeleteAllClones }: DeleteAllClonesOptionProps) {
    const { totalCloneCount, clonePaths } = cloneInfo;

    if (totalCloneCount === 0) {
        return (
            <div className="clone-info-message" style={{ marginBottom: "10px", color: "var(--muted-text-color)" }}>
                <em>{t("delete_notes.no_clones_message")}</em>
            </div>
        );
    }

    return (
        <div className="clone-option-wrapper">
            <FormCheckbox
                name="delete-all-clones"
                label={t("delete_notes.delete_clones_with_count", { count: totalCloneCount })}
                currentValue={deleteAllClones}
                onChange={setDeleteAllClones}
            />
            {clonePaths.length > 0 && (
                <ul className="clone-paths-preview" style={{ marginLeft: "24px", marginTop: "4px", fontSize: "0.9em", color: "var(--muted-text-color)" }}>
                    {clonePaths.map((path, index) => (
                        <li key={index} dangerouslySetInnerHTML={{ __html: path }} />
                    ))}
                    {totalCloneCount > clonePaths.length && (
                        <li><em>{t("delete_notes.and_more_clones", { count: totalCloneCount - clonePaths.length })}</em></li>
                    )}
                </ul>
            )}
        </div>
    );
}
