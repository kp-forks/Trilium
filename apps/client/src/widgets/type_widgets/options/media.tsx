import { t } from "../../../services/i18n";
import { FormTextBoxWithUnit } from "../../react/FormTextBox";
import FormToggle from "../../react/FormToggle";
import { useTriliumOption, useTriliumOptionBool } from "../../react/hooks";
import OptionsRow from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";

export default function MediaSettings() {
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
