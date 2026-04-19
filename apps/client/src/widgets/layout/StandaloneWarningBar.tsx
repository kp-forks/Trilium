import { useRef } from "preact/hooks";
import { t } from "../../services/i18n";
import { useNoteContext, useTooltip } from "../react/hooks";
import "./StandaloneWarningBar.css";

export default function StandaloneWarningBar() {
    const { noteContext } = useNoteContext();
    const badgeRef = useRef<HTMLDivElement>(null);

    useTooltip(badgeRef, {
        title: t("standalone.warning_tooltip"),
        placement: "top",
        delay: 200
    });

    // Only show in the main split, not sub-splits.
    if (noteContext?.mainNtxId) {
        return null;
    }

    return (
        <div ref={badgeRef} className="standalone-badge">
            <span className="bx bx-error-circle" />
            <span className="standalone-badge-text">{t("standalone.badge_label")}</span>
        </div>
    );
}
