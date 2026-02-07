import { useTranslation } from "react-i18next";

import { usePageTitle } from "../../hooks";

export default function Resources() {
    const { t } = useTranslation();
    usePageTitle(t("resources.title"));

    return (
        <p>Resources go here.</p>
    );
}
