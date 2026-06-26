import "./export.css";

import { useState } from "preact/hooks";

import froca from "../../services/froca";
import { t } from "../../services/i18n";
import open from "../../services/open";
import toastService, { type ToastOptionsWithRequiredId } from "../../services/toast";
import tree from "../../services/tree";
import utils, { isStandalone } from "../../services/utils";
import ws from "../../services/ws";
import Button, { ButtonGroup } from "../react/Button";
import { Card, CardSection } from "../react/Card";
import { useTriliumEvent } from "../react/hooks";
import Modal from "../react/Modal";
import SelectableCard, { SelectableCardGrid } from "../react/SelectableCard";

interface ExportDialogProps {
    branchId?: string | null;
    noteTitle?: string;
    defaultType?: "subtree" | "single";
}

interface ExportFormat {
    value: string;
    name: string;
    description: string;
    icon: string;
}

export default function ExportDialog() {
    const [ opts, setOpts ] = useState<ExportDialogProps>();
    const [ exportType, setExportType ] = useState<"subtree" | "single">("subtree");
    const [ subtreeFormat, setSubtreeFormat ] = useState("html");
    const [ singleFormat, setSingleFormat ] = useState("html");
    const [ opmlVersion, setOpmlVersion ] = useState("2.0");
    const [ shown, setShown ] = useState(false);

    useTriliumEvent("showExportDialog", async ({ notePath, defaultType }) => {
        const { noteId, parentNoteId } = tree.getNoteIdAndParentIdFromUrl(notePath);
        if (!parentNoteId) {
            return;
        }

        const branchId = await froca.getBranchId(parentNoteId, noteId);

        setExportType(defaultType ?? "subtree");
        setOpts({
            noteTitle: noteId && await tree.getNoteTitle(noteId),
            defaultType,
            branchId
        });
        setShown(true);
    });

    const formats = exportType === "subtree" ? subtreeFormats : singleFormats;
    const selectedFormat = exportType === "subtree" ? subtreeFormat : singleFormat;
    const setSelectedFormat = exportType === "subtree" ? setSubtreeFormat : setSingleFormat;

    return (
        <Modal
            className="export-dialog"
            title={`${t("export.export_note_title")} ${opts?.noteTitle ?? ""}`}
            size="lg"
            onSubmit={() => {
                if (!opts || !opts.branchId) {
                    return;
                }

                const version = (selectedFormat === "opml" ? opmlVersion : "1.0");
                exportBranch(opts.branchId, exportType, selectedFormat, version);
                setShown(false);
            }}
            onHidden={() => setShown(false)}
            footer={<Button className="export-button" text={t("export.export")} kind="primary" />}
            show={shown}
        >
            <Card heading={t("export.what_to_export")}>
                <CardSection>
                    <ButtonGroup className="export-type-group">
                        <button type="button" className={`btn btn-secondary ${exportType === "subtree" ? "active" : ""}`} onClick={() => setExportType("subtree")}>
                            {t("export.export_type_subtree")}
                        </button>
                        <button type="button" className={`btn btn-secondary ${exportType === "single" ? "active" : ""}`} onClick={() => setExportType("single")}>
                            {t("export.export_type_single")}
                        </button>
                    </ButtonGroup>
                </CardSection>
            </Card>

            <Card heading={t("export.format")}>
                <CardSection>
                    <SelectableCardGrid columns={2}>
                        {formats.map((format) => (
                            <SelectableCard
                                key={format.value} icon={format.icon} title={format.name} description={format.description}
                                selected={selectedFormat === format.value} onSelect={() => setSelectedFormat(format.value)}
                            />
                        ))}
                    </SelectableCardGrid>

                    {selectedFormat === "opml" && (
                        <ButtonGroup className="opml-versions" size="sm">
                            <button type="button" className={`btn btn-secondary ${opmlVersion === "1.0" ? "active" : ""}`} onClick={() => setOpmlVersion("1.0")}>
                                {t("export.opml_version_1")}
                            </button>
                            <button type="button" className={`btn btn-secondary ${opmlVersion === "2.0" ? "active" : ""}`} onClick={() => setOpmlVersion("2.0")}>
                                {t("export.opml_version_2")}
                            </button>
                        </ButtonGroup>
                    )}
                </CardSection>
            </Card>
        </Modal>
    );
}

const HTML_FORMAT: ExportFormat = { value: "html", name: t("export.format_html_name"), description: t("export.format_html_description"), icon: "bx bxl-html5" };
const MARKDOWN_FORMAT: ExportFormat = { value: "markdown", name: t("export.format_markdown_name"), description: t("export.format_markdown_description"), icon: "bx bxl-markdown" };
const SHARE_FORMAT: ExportFormat = { value: "share", name: t("export.format_share_name"), description: t("export.format_share_description"), icon: "bx bx-globe" };
const OPML_FORMAT: ExportFormat = { value: "opml", name: t("export.format_opml_name"), description: t("export.format_opml_description"), icon: "bx bx-list-ul" };

// `share` publishes a static site and only makes sense on a full server, not the standalone build.
const subtreeFormats: ExportFormat[] = [HTML_FORMAT, MARKDOWN_FORMAT, ...(isStandalone ? [] : [SHARE_FORMAT]), OPML_FORMAT];
const singleFormats: ExportFormat[] = [HTML_FORMAT, MARKDOWN_FORMAT];

function exportBranch(branchId: string, type: string, format: string, version: string) {
    const taskId = utils.randomString(10);
    const url = open.getUrlForDownload(`api/branches/${branchId}/export/${type}/${format}/${version}/${taskId}`);
    open.download(url);
}

ws.subscribeToMessages(async (message) => {
    function makeToast(id: string, message: string): ToastOptionsWithRequiredId {
        return {
            id,
            message,
            icon: "export"
        };
    }

    if (!("taskType" in message) || message.taskType !== "export") {
        return;
    }

    if (message.type === "taskError") {
        toastService.closePersistent(message.taskId);
        toastService.showError(message.message);
    } else if (message.type === "taskProgressCount") {
        toastService.showPersistent(makeToast(message.taskId, t("export.export_in_progress", { progressCount: message.progressCount })));
    } else if (message.type === "taskSucceeded") {
        const toast = makeToast(message.taskId, t("export.export_finished_successfully"));
        toast.timeout = 5000;

        toastService.showPersistent(toast);
    }
});
