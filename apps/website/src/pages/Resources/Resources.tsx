import "./Resources.css";

import { useTranslation } from "react-i18next";

import Button, { Link } from "../../components/Button";
import Card from "../../components/Card";
import Section from "../../components/Section";
import { usePageTitle } from "../../hooks";

const iconPacksMeta = Object.values(import.meta.glob("../../../public/resources/icon-packs/*.json", {
    eager: true
}));

export default function Resources() {
    const { t } = useTranslation();
    usePageTitle(t("resources.title"));

    return (
        <Section className="icon-packs">
            <h2>{t("resources.icon_packs")}</h2>

            <div className="grid-3-cols">
                {iconPacksMeta.map(meta => (
                    <Card
                        key={meta.name}
                        title={`${meta.name} ${meta.version}`}
                    >
                        <footer>
                            <Button href={`/resources/icon-packs/${meta.file}`} download text="Download" />
                            <Link href={meta.website} openExternally>Website</Link>
                        </footer>
                    </Card>
                ))}
            </div>
        </Section>
    );
}
