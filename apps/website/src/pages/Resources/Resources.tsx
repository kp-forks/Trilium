import "./Resources.css";

import { Trans, useTranslation } from "react-i18next";

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

            <p>
                <Trans
                    i18nKey="resources.icon_packs_intro"
                    components={{
                        DocumentationLink: <Link href="https://docs.triliumnotes.org/user-guide/concepts/themes/icon-packs" />
                    }}
                />
            </p>

            <div className="grid-3-cols">
                {iconPacksMeta.map(meta => (
                    <Card
                        key={meta.name}
                        title={<>{meta.name} <small>{meta.version}</small></>}
                    >
                        <p className="description">{meta.description}</p>
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
