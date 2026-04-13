import { normalizeMimeTypeForCKEditor } from "@triliumnext/commons";
import { Themes } from "@triliumnext/highlightjs";
import type { CSSProperties } from "preact/compat";
import { useEffect, useMemo, useState } from "preact/hooks";

import { isExperimentalFeatureEnabled } from "../../../services/experimental_features";
import { t } from "../../../services/i18n";
import { ensureMimeTypesForHighlighting, loadHighlightingTheme } from "../../../services/syntax_highlight";
import { formatDateTime, toggleBodyClass } from "../../../services/utils";
import FormCheckbox from "../../react/FormCheckbox";
import FormGroup from "../../react/FormGroup";
import FormRadioGroup from "../../react/FormRadioGroup";
import FormSelect, { FormSelectGroup, FormSelectWithGroups } from "../../react/FormSelect";
import FormText from "../../react/FormText";
import FormTextBox, { FormTextBoxWithUnit } from "../../react/FormTextBox";
import { useTriliumOption, useTriliumOptionBool, useTriliumOptionJson } from "../../react/hooks";
import { getHtml } from "../../react/RawHtml";
import CheckboxList from "./components/CheckboxList";
import OptionsRow, { OptionsRowWithToggle } from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";

const isNewLayout = isExperimentalFeatureEnabled("new-layout");

export default function TextNoteSettings() {
    return (
        <>
            <FormattingToolbar />
            <EditorFeatures />
            <Editor />
            <CodeBlockStyle />
            <TableOfContent />
            <HighlightsList />
        </>
    );
}

function FormattingToolbar() {
    const [ textNoteEditorType, setTextNoteEditorType ] = useTriliumOption("textNoteEditorType", true);
    const [ textNoteEditorMultilineToolbar, setTextNoteEditorMultilineToolbar ] = useTriliumOptionBool("textNoteEditorMultilineToolbar", true);

    return (
        <OptionsSection title={t("editing.editor_type.label")}>
            <FormRadioGroup
                name="editor-type"
                currentValue={textNoteEditorType} onChange={setTextNoteEditorType}
                values={[
                    {
                        value: "ckeditor-balloon",
                        label: t("editing.editor_type.floating.title"),
                        inlineDescription: t("editing.editor_type.floating.description")
                    },
                    {
                        value: "ckeditor-classic",
                        label: t("editing.editor_type.fixed.title"),
                        inlineDescription: t("editing.editor_type.fixed.description")
                    }
                ]}
            />

            <FormCheckbox
                name="multiline-toolbar"
                label={t("editing.editor_type.multiline-toolbar")}
                currentValue={textNoteEditorMultilineToolbar} onChange={setTextNoteEditorMultilineToolbar}
                containerStyle={{ marginInlineStart: "1em" }}
            />
        </OptionsSection>
    );
}

function EditorFeatures() {
    const [emojiCompletionEnabled, setEmojiCompletionEnabled] = useTriliumOptionBool("textNoteEmojiCompletionEnabled");
    const [noteCompletionEnabled, setNoteCompletionEnabled] = useTriliumOptionBool("textNoteCompletionEnabled");
    const [slashCommandsEnabled, setSlashCommandsEnabled] = useTriliumOptionBool("textNoteSlashCommandsEnabled");

    return (
        <OptionsSection title={t("editorfeatures.title")}>
            <OptionsRowWithToggle
                name="emoji-completion-enabled"
                label={t("editorfeatures.emoji_completion_enabled")}
                description={t("editorfeatures.emoji_completion_description")}
                currentValue={emojiCompletionEnabled}
                onChange={setEmojiCompletionEnabled}
            />

            <OptionsRowWithToggle
                name="note-completion-enabled"
                label={t("editorfeatures.note_completion_enabled")}
                description={t("editorfeatures.note_completion_description")}
                currentValue={noteCompletionEnabled}
                onChange={setNoteCompletionEnabled}
            />

            <OptionsRowWithToggle
                name="slash-commands-enabled"
                label={t("editorfeatures.slash_commands_enabled")}
                description={t("editorfeatures.slash_commands_description")}
                currentValue={slashCommandsEnabled}
                onChange={setSlashCommandsEnabled}
            />
        </OptionsSection>
    );
}

function Editor() {
    const [headingStyle, setHeadingStyle] = useTriliumOption("headingStyle");
    const [autoReadonlySize, setAutoReadonlySize] = useTriliumOption("autoReadonlySizeText");
    const [customDateTimeFormat, setCustomDateTimeFormat] = useTriliumOption("customDateTimeFormat");

    useEffect(() => {
        toggleBodyClass("heading-style-", headingStyle);
    }, [headingStyle]);

    return (
        <OptionsSection title={t("text_editor.title")}>
            <OptionsRow name="heading-style" label={t("heading_style.title")} description={t("heading_style.description")}>
                <FormSelect
                    currentValue={headingStyle} onChange={setHeadingStyle}
                    values={[
                        { value: "plain", title: t("heading_style.plain") },
                        { value: "underline", title: t("heading_style.underline") },
                        { value: "markdown", title: t("heading_style.markdown") }
                    ]}
                    keyProperty="value" titleProperty="title"
                />
            </OptionsRow>

            <OptionsRow name="auto-readonly-size-text" label={t("text_auto_read_only_size.label")} description={t("text_auto_read_only_size.description")}>
                <FormTextBoxWithUnit
                    type="number" min={0}
                    unit={t("text_auto_read_only_size.unit")}
                    currentValue={autoReadonlySize}
                    onChange={setAutoReadonlySize}
                />
            </OptionsRow>

            <OptionsRow
                name="custom-date-time-format"
                label={t("custom_date_time_format.title")}
                description={<>{t("custom_date_time_format.description_short")} {t("custom_date_time_format.preview", { preview: formatDateTime(new Date(), customDateTimeFormat) })}</>}
            >
                <FormTextBox
                    placeholder="YYYY-MM-DD HH:mm"
                    currentValue={customDateTimeFormat || "YYYY-MM-DD HH:mm"} onChange={setCustomDateTimeFormat}
                />
            </OptionsRow>
        </OptionsSection>
    );
}

function CodeBlockStyle() {
    const themes = useMemo(() => {
        const darkThemes: ThemeData[] = [];
        const lightThemes: ThemeData[] = [];

        for (const [ id, theme ] of Object.entries(Themes)) {
            const data: ThemeData = {
                val: `default:${  id}`,
                title: theme.name
            };

            if (theme.name.includes("Dark")) {
                darkThemes.push(data);
            } else {
                lightThemes.push(data);
            }
        }

        const output: FormSelectGroup<ThemeData>[] = [
            {
                title: "",
                items: [{
                    val: "none",
                    title: t("code_block.theme_none")
                }]
            },
            {
                title: t("code_block.theme_group_light"),
                items: lightThemes
            },
            {
                title: t("code_block.theme_group_dark"),
                items: darkThemes
            }
        ];
        return output;
    }, []);
    const [ codeBlockTheme, setCodeBlockTheme ] = useTriliumOption("codeBlockTheme");
    const [ codeBlockWordWrap, setCodeBlockWordWrap ] = useTriliumOptionBool("codeBlockWordWrap");

    return (
        <OptionsSection title={t("highlighting.title")}>
            <OptionsRow name="code-block-theme" label={t("highlighting.color-scheme")}>
                <FormSelectWithGroups
                    values={themes}
                    keyProperty="val" titleProperty="title"
                    currentValue={codeBlockTheme} onChange={(newTheme) => {
                        loadHighlightingTheme(newTheme);
                        setCodeBlockTheme(newTheme);
                    }}
                />
            </OptionsRow>

            <OptionsRowWithToggle
                name="code-block-word-wrap"
                label={t("code_block.word_wrapping")}
                currentValue={codeBlockWordWrap}
                onChange={setCodeBlockWordWrap}
            />

            <CodeBlockPreview theme={codeBlockTheme} wordWrap={codeBlockWordWrap} />
        </OptionsSection>
    );
}

const SAMPLE_LANGUAGE = normalizeMimeTypeForCKEditor("application/javascript;env=frontend");
const SAMPLE_CODE = `\
const n = 10;
greet(n); // Print "Hello World" for n times

/**
 * Displays a "Hello World!" message for a given amount of times, on the standard console. The "Hello World!" text will be displayed once per line.
 *
 * @param {number} times    The number of times to print the \`Hello World!\` message.
 */
function greet(times) {
  for (let i = 0; i++; i < times) {
    console.log("Hello World!");
  }
}
`;

function CodeBlockPreview({ theme, wordWrap }: { theme: string, wordWrap: boolean }) {
    const [ code, setCode ] = useState<string>(SAMPLE_CODE);

    useEffect(() => {
        if (theme !== "none") {
            import("@triliumnext/highlightjs").then(async (hljs) => {
                await ensureMimeTypesForHighlighting();
                const highlightedText = hljs.highlight(SAMPLE_CODE, {
                    language: SAMPLE_LANGUAGE
                });
                if (highlightedText) {
                    setCode(highlightedText.value);
                }
            });
        } else {
            setCode(SAMPLE_CODE);
        }
    }, [theme]);

    const codeStyle = useMemo<CSSProperties>(() => {
        if (wordWrap) {
            return { whiteSpace: "pre-wrap" };
        }
        return { whiteSpace: "pre"};

    }, [ wordWrap ]);

    return (
        <div className="note-detail-readonly-text-content ck-content code-sample-wrapper">
            <pre className="hljs selectable-text" style={{ marginBottom: 0 }}>
                <code className="code-sample" style={codeStyle} dangerouslySetInnerHTML={getHtml(code)} />
            </pre>
        </div>
    );
}

interface ThemeData {
    val: string;
    title: string;
}

function TableOfContent() {
    const [ minTocHeadings, setMinTocHeadings ] = useTriliumOption("minTocHeadings");

    return (!isNewLayout &&
        <OptionsSection title={t("table_of_contents.title")}>
            <FormText>{t("table_of_contents.description")}</FormText>

            <FormGroup name="min-toc-headings">
                <FormTextBoxWithUnit
                    type="number"
                    min={0} max={999999999999999} step={1}
                    unit={t("table_of_contents.unit")}
                    currentValue={minTocHeadings} onChange={setMinTocHeadings}
                />
            </FormGroup>

            <FormText>{t("table_of_contents.disable_info")}</FormText>
            <FormText>{t("table_of_contents.shortcut_info")}</FormText>
        </OptionsSection>
    );
}

function HighlightsList() {
    return (
        <OptionsSection title={t("highlights_list.title")}>
            <HighlightsListOptions />

            {!isNewLayout && (
                <>
                    <hr />
                    <h5>{t("highlights_list.visibility_title")}</h5>
                    <FormText>{t("highlights_list.visibility_description")}</FormText>
                    <FormText>{t("highlights_list.shortcut_info")}</FormText>
                </>
            )}
        </OptionsSection>
    );
}

export function HighlightsListOptions() {
    const [ highlightsList, setHighlightsList ] = useTriliumOptionJson<string[]>("highlightsList");

    return (
        <>
            <FormText>{t("highlights_list.description")}</FormText>
            <CheckboxList
                values={[
                    { val: "bold", title: t("highlights_list.bold") },
                    { val: "italic", title: t("highlights_list.italic") },
                    { val: "underline", title: t("highlights_list.underline") },
                    { val: "color", title: t("highlights_list.color") },
                    { val: "bgColor", title: t("highlights_list.bg_color") }
                ]}
                keyProperty="val" titleProperty="title"
                currentValue={highlightsList} onChange={setHighlightsList}
            />
        </>
    );
}

