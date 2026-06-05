import { TypeWidgetProps } from "./type_widget";
import { JSX } from "preact/jsx-runtime";
import AppearanceSettings from "./options/appearance";
import ShortcutSettings from "./options/shortcuts";
import TextNoteSettings from "./options/text_notes";
import CodeNoteSettings from "./options/code_notes";
import MediaSettings from "./options/media";
import SpellcheckSettings from "./options/spellcheck";
import PasswordSettings from "./options/password";
import MultiFactorAuthenticationSettings from "./options/multi_factor_authentication";
import EtapiSettings from "./options/etapi";
import BackupSettings from "./options/backup";
import SyncOptions from "./options/sync";
import OtherSettings from "./options/other";
import InternationalizationOptions from "./options/i18n";
import AdvancedSettings from "./options/advanced";
import SecuritySettings from "./options/security";
import LlmSettings from "./options/llm";
import "./ContentWidget.css";
import { t } from "../../services/i18n";
import BackendLog from "./code/BackendLog";
import SettingsNavigation from "./options/components/SettingsNavigation";

export type OptionPages = "_optionsAppearance" | "_optionsShortcuts" | "_optionsTextNotes" | "_optionsCodeNotes" | "_optionsMedia" | "_optionsSpellcheck" | "_optionsPassword" | "_optionsMFA" | "_optionsEtapi" | "_optionsBackup" | "_optionsSync" | "_optionsOther" | "_optionsLocalization" | "_optionsSecurity" | "_optionsAdvanced" | "_optionsLlm";

const CONTENT_WIDGETS: Record<OptionPages | "_backendLog", (props: TypeWidgetProps) => JSX.Element> = {
    _optionsAppearance: AppearanceSettings,
    _optionsShortcuts: ShortcutSettings,
    _optionsTextNotes: TextNoteSettings,
    _optionsCodeNotes: CodeNoteSettings,
    _optionsMedia: MediaSettings,
    _optionsSpellcheck: SpellcheckSettings,
    _optionsPassword: PasswordSettings,
    _optionsMFA: MultiFactorAuthenticationSettings,
    _optionsEtapi: EtapiSettings,
    _optionsBackup: BackupSettings,
    _optionsSync: SyncOptions,
    _optionsOther: OtherSettings,
    _optionsLocalization: InternationalizationOptions,
    _optionsSecurity: SecuritySettings,
    _optionsAdvanced: AdvancedSettings,
    _optionsLlm: LlmSettings,
    _backendLog: BackendLog
}

/**
 * Type widget that displays one or more widgets based on the type of note, generally used for options and other interactive notes such as the backend log.
 *
 * @param param0
 * @returns
 */
export default function ContentWidget({ note, ...restProps }: TypeWidgetProps) {
    const Content = CONTENT_WIDGETS[note.noteId];
    const isOptions = note.noteId.startsWith("_options");
    const content = Content
        ? <Content note={note} {...restProps} />
        : (t("content_widget.unknown_widget", { id: note.noteId }));

    // For options pages, render an in-content page selector beside the page. The selector
    // duplicates the (hoisted) note tree's list so users can switch pages without the tree.
    // `.note-detail-content-widget-content.options` stays the direct parent of the page so the
    // theme's existing options styling keeps applying.
    if (isOptions) {
        return (
            <div className="options-with-nav">
                <SettingsNavigation activeNoteId={note.noteId} noteContext={restProps.noteContext} />
                <div className="note-detail-content-widget-content options">
                    {content}
                </div>
            </div>
        );
    }

    return (
        <div className="note-detail-content-widget-content">
            {content}
        </div>
    )
}
