import { t } from "../../../services/i18n";
import OptionsSection from "./components/OptionsSection";

export default function LlmSettings() {
    return (
        <OptionsSection title={t("llm.settings_title")}>
            <p>{t("llm.settings_description")}</p>
        </OptionsSection>
    );
}
