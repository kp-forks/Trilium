import { useTranslation } from "react-i18next";

import Card from "../../components/Card";
import Section from "../../components/Section";
import { usePageTitle } from "../../hooks";

const iconPacksMeta = Object.values(import.meta.glob("../../assets/resources/icon-packs/*.json", {
    eager: true
}));

export default function Resources() {
    const { t } = useTranslation();
    usePageTitle(t("resources.title"));

    return (
        <Section>
            <h2>{t("resources.icon_packs")}</h2>

            <div className="grid-3-cols">
                {iconPacksMeta.map(meta => (
                    <Card
                        key={meta.name}
                        title={`${meta.name} ${meta.version}`}
                        moreInfoUrl={meta.website}
                    />
                ))}
            </div>
        </Section>
    );
}
