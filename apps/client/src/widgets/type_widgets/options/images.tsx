import { t } from "../../../services/i18n";
import FormCheckbox from "../../react/FormCheckbox";
import FormGroup from "../../react/FormGroup";
import { FormTextBoxWithUnit } from "../../react/FormTextBox";
import { useTriliumOption, useTriliumOptionBool } from "../../react/hooks";
import OptionsSection from "./components/OptionsSection";

export default function ImageSettings() {
    const [ downloadImagesAutomatically, setDownloadImagesAutomatically ] = useTriliumOptionBool("downloadImagesAutomatically");
    const [ compressImages, setCompressImages ] = useTriliumOptionBool("compressImages");
    const [ imageMaxWidthHeight, setImageMaxWidthHeight ] = useTriliumOption("imageMaxWidthHeight"); 
    const [ imageJpegQuality, setImageJpegQuality ] = useTriliumOption("imageJpegQuality");

    return (
        <OptionsSection title={t("images.images_section_title")}>
            <FormGroup name="download-images-automatically" description={t("images.download_images_description")}>
                <FormCheckbox                    
                    label={t("images.download_images_automatically")}
                    currentValue={downloadImagesAutomatically} onChange={setDownloadImagesAutomatically}
                />
            </FormGroup>

            <hr/>

            <FormCheckbox
                name="image-compression-enabled"
                label={t("images.enable_image_compression")}
                currentValue={compressImages} onChange={setCompressImages}
            />

            <FormGroup name="image-max-width-height" label={t("images.max_image_dimensions")} disabled={!compressImages}>
                <FormTextBoxWithUnit
                    type="number" min="1"
                    unit={t("images.max_image_dimensions_unit")}
                    currentValue={imageMaxWidthHeight} onChange={setImageMaxWidthHeight}
                />
            </FormGroup>

            <FormGroup name="image-jpeg-quality" label={t("images.jpeg_quality_description")} disabled={!compressImages}>
                <FormTextBoxWithUnit                    
                    min="10" max="100" type="number"
                    unit={t("units.percentage")}
                    currentValue={imageJpegQuality} onChange={setImageJpegQuality}
                />
            </FormGroup>
        </OptionsSection>
    );
}
