import { useCallback, useMemo } from "preact/hooks";

import { t } from "../../../services/i18n";
import { dynamicRequire, isElectron } from "../../../services/utils";
import FormText from "../../react/FormText";
import FormToggle from "../../react/FormToggle";
import { useTriliumOption, useTriliumOptionBool } from "../../react/hooks";
import CheckboxList from "./components/CheckboxList";
import OptionsRow from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";

export default function SpellcheckSettings() {
    if (isElectron()) {
        return <ElectronSpellcheckSettings />;
    }
    return <WebSpellcheckSettings />;
}

interface SpellcheckLanguage {
    code: string;
    name: string;
}

function ElectronSpellcheckSettings() {
    const [ spellCheckEnabled, setSpellCheckEnabled ] = useTriliumOptionBool("spellCheckEnabled");

    return (
        <OptionsSection title={t("spellcheck.title")}>
            <FormText>{t("spellcheck.restart-required")}</FormText>

            <OptionsRow name="spell-check-enabled" label={t("spellcheck.enable")}>
                <FormToggle
                    switchOnName="" switchOffName=""
                    currentValue={spellCheckEnabled}
                    onChange={setSpellCheckEnabled}
                />
            </OptionsRow>

            {spellCheckEnabled && <SpellcheckLanguages />}
        </OptionsSection>
    );
}

function SpellcheckLanguages() {
    const [ spellCheckLanguageCode, setSpellCheckLanguageCode ] = useTriliumOption("spellCheckLanguageCode");

    const selectedCodes = useMemo(() =>
        (spellCheckLanguageCode ?? "")
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c.length > 0),
    [spellCheckLanguageCode]
    );

    const setSelectedCodes = useCallback((codes: string[]) => {
        setSpellCheckLanguageCode(codes.join(", "));
    }, [setSpellCheckLanguageCode]);

    const availableLanguages = useMemo<SpellcheckLanguage[]>(() => {
        if (!isElectron()) {
            return [];
        }

        const { webContents } = dynamicRequire("@electron/remote").getCurrentWindow();
        const codes = webContents.session.availableSpellCheckerLanguages as string[];
        const displayNames = new Intl.DisplayNames([navigator.language], { type: "language" });

        return codes.map((code) => ({
            code,
            name: displayNames.of(code) ?? code
        })).sort((a, b) => a.name.localeCompare(b.name));
    }, []);

    return (
        <OptionsRow name="spell-check-languages" label={t("spellcheck.language_code_label")} fullWidth>
            <CheckboxList
                values={availableLanguages}
                keyProperty="code" titleProperty="name"
                currentValue={selectedCodes}
                onChange={setSelectedCodes}
                columnWidth="200px"
            />
        </OptionsRow>
    );
}

function WebSpellcheckSettings() {
    return (
        <OptionsSection title={t("spellcheck.title")}>
            <p>{t("spellcheck.description")}</p>
        </OptionsSection>
    );
}
