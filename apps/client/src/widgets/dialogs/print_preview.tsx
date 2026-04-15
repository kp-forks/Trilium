import { useCallback, useMemo, useRef, useState } from "preact/hooks";

import FNote from "../../entities/fnote";
import { t } from "../../services/i18n";
import toast from "../../services/toast";
import { dynamicRequire, isElectron } from "../../services/utils";
import Button, { ButtonGroup } from "../react/Button";
import { useNoteLabelBoolean, useNoteLabelWithDefault, useTriliumEvent } from "../react/hooks";
import Modal from "../react/Modal";
import Slider from "../react/Slider";
import PdfViewer from "../type_widgets/file/PdfViewer";
import OptionsRow from "../type_widgets/options/components/OptionsRow";
import OptionsSection from "../type_widgets/options/components/OptionsSection";

const PAGE_SIZES = ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "Legal", "Letter", "Tabloid", "Ledger"] as const;
const MARGIN_PRESETS = ["default", "none", "minimum"] as const;
type MarginPreset = typeof MARGIN_PRESETS[number];

interface CustomMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

function parseMarginValue(value: string): { preset: MarginPreset | "custom"; custom: CustomMargins } {
    if (MARGIN_PRESETS.includes(value as MarginPreset)) {
        return { preset: value as MarginPreset, custom: { top: 10, right: 10, bottom: 10, left: 10 } };
    }

    const parts = value.split(",").map(Number);
    if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
        return { preset: "custom", custom: { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] } };
    }

    return { preset: "default", custom: { top: 10, right: 10, bottom: 10, left: 10 } };
}

function serializeMargins(preset: MarginPreset | "custom", custom: CustomMargins): string {
    if (preset !== "custom") return preset;
    return `${custom.top},${custom.right},${custom.bottom},${custom.left}`;
}

/** Validates a page-range string such as "1-5, 8, 11-13". Empty string is valid (= all pages). */
function isValidPageRanges(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return true;
    return /^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/.test(trimmed);
}

export interface PrintPreviewData {
    pdfBuffer: Uint8Array;
    note: FNote;
    notePath: string;
}

interface PreviewOpts {
    landscape: boolean;
    pageSize: string;
    scale: number;
    margins: string;
    pageRanges: string;
}

export default function PrintPreviewDialog() {
    const [shown, setShown] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string>();
    const [note, setNote] = useState<FNote>();
    const [loading, setLoading] = useState(false);
    const bufferRef = useRef<Uint8Array>();
    const notePathRef = useRef("");

    const [landscape, setLandscape] = useNoteLabelBoolean(note, "printLandscape");
    const [pageSize, setPageSize] = useNoteLabelWithDefault(note, "printPageSize", "Letter");
    const [scaleStr, setScaleStr] = useNoteLabelWithDefault(note, "printScale", "1");
    const scale = parseFloat(scaleStr) || 1;
    const [marginsStr, setMarginsStr] = useNoteLabelWithDefault(note, "printMargins", "default");
    const { preset: marginPreset, custom: customMargins } = useMemo(() => parseMarginValue(marginsStr), [marginsStr]);

    // Page ranges are kept local — they're one-off per export, not a persistent preference.
    const [pageRanges, setPageRanges] = useState("");
    const pageRangesValid = isValidPageRanges(pageRanges);

    const updatePreview = useCallback((buffer: Uint8Array) => {
        bufferRef.current = buffer;

        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
        }

        const blob = new Blob([buffer as BlobPart], { type: "application/pdf" });
        setPdfUrl(URL.createObjectURL(blob));
        setLoading(false);
    }, [pdfUrl]);

    useTriliumEvent("showPrintPreview", (data: PrintPreviewData) => {
        setNote(data.note);
        notePathRef.current = data.notePath;
        updatePreview(data.pdfBuffer);
        setShown(true);
    });

    function handleClose() {
        setShown(false);
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl(undefined);
        }
        bufferRef.current = undefined;
        setLoading(false);
    }

    function handleSave() {
        if (!bufferRef.current) return;

        const { ipcRenderer } = dynamicRequire("electron");
        ipcRenderer.send("save-pdf", {
            title: note?.title ?? "",
            buffer: bufferRef.current
        });
        handleClose();
    }

    function handleOrientationChange(newLandscape: boolean) {
        if (newLandscape === landscape) return;
        setLandscape(newLandscape);
        regeneratePreview({ landscape: newLandscape, pageSize, scale, margins: marginsStr, pageRanges });
    }

    function handlePageSizeChange(newPageSize: string) {
        if (newPageSize === pageSize) return;
        setPageSize(newPageSize);
        regeneratePreview({ landscape, pageSize: newPageSize, scale, margins: marginsStr, pageRanges });
    }

    const scaleDebounceRef = useRef<ReturnType<typeof setTimeout>>();

    function handleScaleChange(newScale: number) {
        const clamped = Math.min(2, Math.max(0.1, Math.round(newScale * 10) / 10));
        setScaleStr(String(clamped));

        clearTimeout(scaleDebounceRef.current);
        scaleDebounceRef.current = setTimeout(() => {
            regeneratePreview({ landscape, pageSize, scale: clamped, margins: marginsStr, pageRanges });
        }, 500);
    }

    function handleMarginPresetChange(newPreset: string) {
        if (newPreset === marginPreset) return;
        const newValue = serializeMargins(newPreset as MarginPreset | "custom", customMargins);
        setMarginsStr(newValue);
        regeneratePreview({ landscape, pageSize, scale, margins: newValue, pageRanges });
    }

    const marginDebounceRef = useRef<ReturnType<typeof setTimeout>>();

    function handleCustomMarginChange(side: keyof CustomMargins, value: number) {
        const newCustom = { ...customMargins, [side]: Math.max(0, value) };
        const newValue = serializeMargins("custom", newCustom);
        setMarginsStr(newValue);

        clearTimeout(marginDebounceRef.current);
        marginDebounceRef.current = setTimeout(() => {
            regeneratePreview({ landscape, pageSize, scale, margins: newValue, pageRanges });
        }, 500);
    }

    const pageRangesDebounceRef = useRef<ReturnType<typeof setTimeout>>();

    function handlePageRangesChange(newValue: string) {
        setPageRanges(newValue);

        clearTimeout(pageRangesDebounceRef.current);
        if (!isValidPageRanges(newValue)) return;

        pageRangesDebounceRef.current = setTimeout(() => {
            regeneratePreview({ landscape, pageSize, scale, margins: marginsStr, pageRanges: newValue.trim() });
        }, 600);
    }

    function regeneratePreview(opts: PreviewOpts) {
        if (!isElectron()) return;

        setLoading(true);
        const { ipcRenderer } = dynamicRequire("electron");

        const onResult = (_e: any, { buffer, error }: { buffer?: Uint8Array; error?: string }) => {
            toast.closePersistent("printing");
            if (error) {
                setLoading(false);
                toast.showError(t("print_preview.render_error"));
                return;
            }
            if (buffer) {
                updatePreview(buffer);
            }
        };
        ipcRenderer.once("export-as-pdf-preview-result", onResult);

        ipcRenderer.send("export-as-pdf-preview", {
            notePath: notePathRef.current,
            pageSize: opts.pageSize,
            landscape: opts.landscape,
            scale: opts.scale,
            margins: opts.margins,
            pageRanges: opts.pageRanges
        });
    }

    return (
        <Modal
            className="print-preview-dialog"
            title={t("print_preview.title")}
            size="xl"
            show={shown}
            onHidden={handleClose}
            bodyStyle={{ height: "78vh", padding: 0, display: "flex" }}
            footer={
                <>
                    <Button text={t("print_preview.close")} onClick={handleClose} />
                    <Button text={t("print_preview.save")} className="btn-primary" onClick={handleSave} disabled={loading} />
                </>
            }
        >
            <div style={{ padding: "16px", minWidth: "250px", overflowY: "auto" }}>
                <OptionsSection>
                    <OptionsRow name="orientation" label={t("print_preview.orientation")}>
                        <ButtonGroup>
                            <Button
                                text={t("print_preview.portrait")}
                                icon="bx-rectangle bx-rotate-90"
                                className={!landscape ? "active" : ""}
                                onClick={() => handleOrientationChange(false)}
                                disabled={loading}
                                size="small"
                            />
                            <Button
                                text={t("print_preview.landscape")}
                                icon="bx-rectangle"
                                className={landscape ? "active" : ""}
                                onClick={() => handleOrientationChange(true)}
                                disabled={loading}
                                size="small"
                            />
                        </ButtonGroup>
                    </OptionsRow>

                    <OptionsRow name="pageSize" label={t("print_preview.page_size")}>
                        <select
                            class="form-select form-select-sm"
                            value={pageSize}
                            onChange={(e) => handlePageSizeChange((e.target as HTMLSelectElement).value)}
                            disabled={loading}
                        >
                            {PAGE_SIZES.map((size) => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                    </OptionsRow>

                    <OptionsRow name="scale" label={t("print_preview.scale")} description={`${Math.round(scale * 100)}%`}>
                        <Slider
                            value={scale}
                            min={0.1}
                            max={2}
                            step={0.1}
                            onChange={handleScaleChange}
                        />
                    </OptionsRow>

                    <OptionsRow name="margins" label={t("print_preview.margins")}>
                        <select
                            class="form-select form-select-sm"
                            value={marginPreset}
                            onChange={(e) => handleMarginPresetChange((e.target as HTMLSelectElement).value)}
                            disabled={loading}
                        >
                            <option value="default">{t("print_preview.margins_default")}</option>
                            <option value="none">{t("print_preview.margins_none")}</option>
                            <option value="minimum">{t("print_preview.margins_minimum")}</option>
                            <option value="custom">{t("print_preview.margins_custom")}</option>
                        </select>
                    </OptionsRow>

                    {marginPreset === "custom" && (
                        <MarginEditor margins={customMargins} onChange={handleCustomMarginChange} disabled={loading} />
                    )}

                    <OptionsRow
                        name="pageRanges"
                        label={t("print_preview.page_ranges")}
                        description={!pageRangesValid ? t("print_preview.page_ranges_invalid") : t("print_preview.page_ranges_hint")}
                    >
                        <input
                            type="text"
                            class={`form-control form-control-sm ${!pageRangesValid ? "is-invalid" : ""}`}
                            value={pageRanges}
                            placeholder={t("print_preview.page_ranges_placeholder")}
                            onInput={(e) => handlePageRangesChange((e.target as HTMLInputElement).value)}
                            disabled={loading}
                            style={{ width: "140px" }}
                        />
                    </OptionsRow>
                </OptionsSection>
            </div>

            <div style={{ flex: 1, position: "relative" }}>
                {loading && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, backgroundColor: "var(--modal-bg-color, rgba(255,255,255,0.8))" }}>
                        <span class="bx bx-loader-circle bx-spin" style={{ fontSize: "2rem" }} />
                    </div>
                )}
                {pdfUrl && <PdfViewer pdfUrl={pdfUrl} />}
            </div>
        </Modal>
    );
}

function MarginEditor({ margins, onChange, disabled }: {
    margins: CustomMargins;
    onChange: (side: keyof CustomMargins, value: number) => void;
    disabled: boolean;
}) {
    const spinnerStyle = { width: "130px" };

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "8px 0" }}>
            <MarginSpinner label={t("print_preview.margin_top")} value={margins.top} onChange={(v) => onChange("top", v)} disabled={disabled} style={spinnerStyle} />
            <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
                <MarginSpinner label={t("print_preview.margin_left")} value={margins.left} onChange={(v) => onChange("left", v)} disabled={disabled} style={spinnerStyle} />
                <MarginSpinner label={t("print_preview.margin_right")} value={margins.right} onChange={(v) => onChange("right", v)} disabled={disabled} style={spinnerStyle} />
            </div>
            <MarginSpinner label={t("print_preview.margin_bottom")} value={margins.bottom} onChange={(v) => onChange("bottom", v)} disabled={disabled} style={spinnerStyle} />
        </div>
    );
}

function MarginSpinner({ label, value, onChange, disabled, style }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    disabled: boolean;
    style?: Record<string, string>;
}) {
    return (
        <div class="input-group input-group-sm" style={style}>
            <input
                type="number"
                class="form-control form-control-sm"
                title={label}
                aria-label={label}
                value={value}
                min={0}
                max={100}
                step={1}
                onChange={(e) => onChange(Math.min(100, (e.target as HTMLInputElement).valueAsNumber || 0))}
                disabled={disabled}
            />
            <span class="input-group-text">mm</span>
        </div>
    );
}
