import { t } from "../../../services/i18n";
import FormTextBox, { FormTextBoxWithUnit } from "../../react/FormTextBox";
import FormToggle from "../../react/FormToggle";
import { useTriliumOption, useTriliumOptionBool } from "../../react/hooks";
import OptionsRow from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";

export default function MediaSettings() {
    return (
        <>
            <ImageSettings />
            <OcrSettings />
        </>
    );
}

function ImageSettings() {
    const [ downloadImagesAutomatically, setDownloadImagesAutomatically ] = useTriliumOptionBool("downloadImagesAutomatically");
    const [ compressImages, setCompressImages ] = useTriliumOptionBool("compressImages");
    const [ imageMaxWidthHeight, setImageMaxWidthHeight ] = useTriliumOption("imageMaxWidthHeight");
    const [ imageJpegQuality, setImageJpegQuality ] = useTriliumOption("imageJpegQuality");

    return (
        <OptionsSection title={t("images.images_section_title")}>
            <OptionsRow name="download-images-automatically" label={t("images.download_images_automatically")} description={t("images.download_images_description")}>
                <FormToggle
                    switchOnName="" switchOffName=""
                    currentValue={downloadImagesAutomatically}
                    onChange={setDownloadImagesAutomatically}
                />
            </OptionsRow>

            <OptionsRow name="image-compression-enabled" label={t("images.enable_image_compression")} description={t("images.enable_image_compression_description")}>
                <FormToggle
                    switchOnName="" switchOffName=""
                    currentValue={compressImages}
                    onChange={setCompressImages}
                />
            </OptionsRow>

            <OptionsRow name="image-max-width-height" label={t("images.max_image_dimensions")} description={t("images.max_image_dimensions_description")}>
                <FormTextBoxWithUnit
                    type="number" min="1"
                    disabled={!compressImages}
                    unit={t("images.max_image_dimensions_unit")}
                    currentValue={imageMaxWidthHeight} onChange={setImageMaxWidthHeight}
                />
            </OptionsRow>

            <OptionsRow name="image-jpeg-quality" label={t("images.jpeg_quality")} description={t("images.jpeg_quality_description")}>
                <FormTextBoxWithUnit
                    min="10" max="100" type="number"
                    disabled={!compressImages}
                    unit={t("units.percentage")}
                    currentValue={imageJpegQuality} onChange={setImageJpegQuality}
                />
            </OptionsRow>
        </OptionsSection>
    );
}

function OcrSettings() {
    const [ ocrEnabled, setOcrEnabled ] = useTriliumOptionBool("ocrEnabled");
    const [ ocrAutoProcess, setOcrAutoProcess ] = useTriliumOptionBool("ocrAutoProcessImages");
    const [ ocrLanguage, setOcrLanguage ] = useTriliumOption("ocrLanguage");
    const [ ocrMinConfidence, setOcrMinConfidence ] = useTriliumOption("ocrMinConfidence");

    return (
        <OptionsSection title={t("images.ocr_section_title")}>
            <OptionsRow name="ocr-enabled" label={t("images.enable_ocr")} description={t("images.ocr_description")}>
                <FormToggle
                    switchOnName="" switchOffName=""
                    currentValue={ocrEnabled}
                    onChange={setOcrEnabled}
                />
            </OptionsRow>

            <OptionsRow name="ocr-auto-process" label={t("images.ocr_auto_process")} description={t("images.ocr_auto_process_description")}>
                <FormToggle
                    switchOnName="" switchOffName=""
                    currentValue={ocrAutoProcess}
                    onChange={setOcrAutoProcess}
                    disabled={!ocrEnabled}
                />
            </OptionsRow>

            <OptionsRow name="ocr-language" label={t("images.ocr_language")} description={t("images.ocr_language_description")}>
                <FormTextBox
                    disabled={!ocrEnabled}
                    currentValue={ocrLanguage}
                    onChange={setOcrLanguage}
                />
            </OptionsRow>

            <OptionsRow name="ocr-min-confidence" label={t("images.ocr_min_confidence")} description={t("images.ocr_confidence_description")}>
                <FormTextBoxWithUnit
                    type="number" min="0" max="1" step="0.05"
                    disabled={!ocrEnabled}
                    unit={t("images.ocr_confidence_unit")}
                    currentValue={ocrMinConfidence}
                    onChange={setOcrMinConfidence}
                />
            </OptionsRow>
        </OptionsSection>
    );
}
