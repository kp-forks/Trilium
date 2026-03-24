import { BootstrapCommonItems, BootstrapDefinition } from "@triliumnext/commons";
import { getSql } from "./sql";
import protected_session from "./protected_session";
import { generateCss, generateIconRegistry, getIconPacks, MIME_TO_EXTENSION_MAPPINGS } from "./icon_packs";
import options from "./options";
import { getCurrentLocale } from "./i18n";

export default function getSharedBootstrapItems(assetPath: string, dbInitialized: boolean) {
    const sql = getSql();
    const currentLocale = getCurrentLocale();

    const commonItems: Partial<BootstrapCommonItems> = {
        assetPath,
        ...getIconConfig(assetPath)
    };

    if (!dbInitialized) {
        return commonItems;
    }

    return {
        ...commonItems,
        headingStyle: options.getOption("headingStyle") as "plain" | "underline" | "markdown",
        layoutOrientation: options.getOption("layoutOrientation") as "vertical" | "horizontal",
        maxEntityChangeIdAtLoad: sql.getValue("SELECT COALESCE(MAX(id), 0) FROM entity_changes"),
        maxEntityChangeSyncIdAtLoad: sql.getValue("SELECT COALESCE(MAX(id), 0) FROM entity_changes WHERE isSynced = 1"),
        isProtectedSessionAvailable: protected_session.isProtectedSessionAvailable(),
        currentLocale,
        isRtl: !!currentLocale.rtl,
    }
}

export function getIconConfig(assetPath: string): Pick<BootstrapDefinition, "iconRegistry" | "iconPackCss"> {
    const iconPacks = getIconPacks();

    return {
        iconRegistry: generateIconRegistry(iconPacks),
        iconPackCss: iconPacks
            .map(p => generateCss(p, p.builtin
                ? `${assetPath}/fonts/${p.fontAttachmentId}.${MIME_TO_EXTENSION_MAPPINGS[p.fontMime]}`
                : `api/attachments/download/${p.fontAttachmentId}`))
            .filter(Boolean)
            .join("\n\n"),
    };
}
