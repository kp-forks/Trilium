import "./appearance.css";

import { FontFamily, OptionNames } from "@triliumnext/commons";
import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";

import zoomService from "../../../components/zoom";
import { t } from "../../../services/i18n";
import server from "../../../services/server";
import { isElectron, isMobile, reloadFrontendApp, restartDesktopApp } from "../../../services/utils";
import { VerticalLayoutIcon } from "../../buttons/global_menu";
import Button from "../../react/Button";
import Column from "../../react/Column";
import FormCheckbox from "../../react/FormCheckbox";
import FormGroup from "../../react/FormGroup";
import FormList, { FormListHeader, FormListItem } from "../../react/FormList";
import FormSelect from "../../react/FormSelect";
import FormText from "../../react/FormText";
import { FormTextBoxWithUnit } from "../../react/FormTextBox";
import { useTriliumOption, useTriliumOptionBool } from "../../react/hooks";
import Icon from "../../react/Icon";
import Modal from "../../react/Modal";
import Slider from "../../react/Slider";
import OptionsRow, { OptionsRowWithButton, OptionsRowWithToggle } from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";
import PlatformIndicator from "./components/PlatformIndicator";
import RadioWithIllustration from "./components/RadioWithIllustration";
import RelatedSettings from "./components/RelatedSettings";

const MIN_CONTENT_WIDTH = 640;

interface Theme {
    val: string;
    title: string;
    noteId?: string;
}

const BUILTIN_THEMES: Theme[] = [
    { val: "next", title: t("theme.triliumnext") },
    { val: "next-light", title: t("theme.triliumnext-light") },
    { val: "next-dark", title: t("theme.triliumnext-dark") },
    { val: "auto", title: t("theme.auto_theme") },
    { val: "light", title: t("theme.light_theme") },
    { val: "dark", title: t("theme.dark_theme") }
];

interface FontFamilyEntry {
    value: FontFamily;
    label?: string;
}

interface FontGroup {
    title: string;
    items: FontFamilyEntry[];
}

const FONT_FAMILIES: FontGroup[] = [
    {
        title: t("fonts.generic-fonts"),
        items: [
            { value: "theme", label: t("fonts.theme_defined") },
            { value: "system", label: t("fonts.system-default") },
            { value: "serif", label: t("fonts.serif") },
            { value: "sans-serif", label: t("fonts.sans-serif") },
            { value: "monospace", label: t("fonts.monospace") }
        ]
    },
    {
        title: t("fonts.sans-serif-system-fonts"),
        items: [{ value: "Arial" }, { value: "Verdana" }, { value: "Helvetica" }, { value: "Tahoma" }, { value: "Trebuchet MS" }, { value: "Microsoft YaHei" }]
    },
    {
        title: t("fonts.serif-system-fonts"),
        items: [{ value: "Times New Roman" }, { value: "Georgia" }, { value: "Garamond" }]
    },
    {
        title: t("fonts.monospace-system-fonts"),
        items: [
            { value: "Courier New" },
            { value: "Brush Script MT" },
            { value: "Impact" },
            { value: "American Typewriter" },
            { value: "Andalé Mono" },
            { value: "Lucida Console" },
            { value: "Monaco" }
        ]
    },
    {
        title: t("fonts.handwriting-system-fonts"),
        items: [{ value: "Bradley Hand" }, { value: "Luminari" }, { value: "Comic Sans MS" }]
    }
];

export default function AppearanceSettings() {
    return (
        <div>
            {!isMobile() && <LayoutOptions />}
            <ApplicationTheme />
            <Fonts />
            {isElectron() && <ElectronIntegration /> }
            <Performance />
            <MaxContentWidth />
            <RibbonOptions />
            <RelatedSettings items={[
                {
                    title: t("settings_appearance.related_code_blocks"),
                    targetPage: "_optionsTextNotes"
                },
                {
                    title: t("settings_appearance.related_code_notes"),
                    targetPage: "_optionsCodeNotes"
                }
            ]} />
        </div>
    );
}

function LayoutOptions() {
    const [ newLayout, setNewLayout ] = useTriliumOptionBool("newLayout");
    const [ layoutOrientation, setLayoutOrientation ] = useTriliumOption("layoutOrientation", true);

    return (
        <OptionsSection title={t("settings_appearance.ui")}>
            <OptionsRow name="layout-style" label={t("settings_appearance.ui_layout_style")}>
                <RadioWithIllustration
                    currentValue={newLayout ? "new-layout" : "old-layout"}
                    onChange={async newValue => {
                        await setNewLayout(newValue === "new-layout");
                        reloadFrontendApp();
                    }}
                    values={[
                        { key: "old-layout", text: t("settings_appearance.ui_old_layout"), illustration: <LayoutIllustration /> },
                        { key: "new-layout", text: t("settings_appearance.ui_new_layout"), illustration: <LayoutIllustration isNewLayout /> }
                    ]}
                />
            </OptionsRow>
            <OptionsRow name="layout-orientation" label={t("settings_appearance.ui_layout_orientation")}>
                <RadioWithIllustration
                    currentValue={layoutOrientation ?? "vertical"}
                    onChange={setLayoutOrientation}
                    values={[
                        { key: "vertical", text: t("theme.layout-vertical-title"), illustration: <OrientationIllustration orientation="vertical" /> },
                        { key: "horizontal", text: t("theme.layout-horizontal-title"), illustration: <OrientationIllustration orientation="horizontal" /> }
                    ]}
                />
            </OptionsRow>
        </OptionsSection>
    );
}

function LayoutIllustration({ isNewLayout }: { isNewLayout?: boolean }) {
    return (
        <div className="old-layout-illustration">
            <div className="launcher-pane">
                <VerticalLayoutIcon />
                <Icon icon="bx bx-send" />
                <Icon icon="bx bx-file-blank" />
                <Icon icon="bx bx-search" />
            </div>

            <div className="tree">
                <ul>
                    <li>Options</li>
                    <ul>
                        <li>Appearance</li>
                        <li>Shortcuts</li>
                        <li>Text Notes</li>
                        <li>Code Notes</li>
                        <li>Images</li>
                    </ul>
                </ul>
            </div>

            <div className="main">
                <div className="tab-bar" />

                <div className="content">

                    {(isNewLayout) ? (
                        <div className="note-header">
                            <div className="note-toolbar">
                                <Icon icon="bx bx-dock-right" />
                            </div>
                            <div className="note-inline-title">
                                <Icon className="note-icon" icon="bx bx-leaf" />
                                <div className="note-title-row">
                                    <div className="title">Title</div>
                                    <div className="subtitle">Just a sample note</div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="title-bar">
                                <Icon icon="bx bx-leaf" />
                                <span className="title">Title</span>
                                <Icon icon="bx bx-dock-right" />
                            </div>
                        </div>
                    )}

                    {!isNewLayout && <div className="ribbon">
                        <div className="ribbon-header">
                            <Icon icon="bx bx-slider" />
                            <Icon icon="bx bx-list-check" />
                            <Icon icon="bx bx-list-plus" />
                            <Icon icon="bx bx-collection" />
                        </div>

                        <div className="ribbon-body">
                            <div className="ribbon-body-content" />
                        </div>
                    </div>}

                    {isNewLayout && <div className="note-title-actions">
                        <Icon icon="bx bx-chevron-down" />{" "}Promoted attributes
                    </div>}

                    <div className="content-inner">
                        This is a "demo" document packaged with Trilium to showcase some of its features and also give you some ideas on how you might structure your notes. You can play with it, and modify the note content and tree structure as you wish.
                    </div>

                    {isNewLayout && <div className="status-bar">
                        <div className="status-bar-breadcrumb">
                            <Icon icon="bx bx-home" />
                            <Icon icon="bx bx-chevron-right" />
                            Note
                            <Icon icon="bx bx-chevron-right" />
                            Note
                        </div>

                        <div className="status-bar-actions">
                            <Icon icon="bx bx-list-check" />
                            <Icon icon="bx bx-info-circle" />
                        </div>
                    </div>}
                </div>
            </div>
        </div>
    );
}

function OrientationIllustration({ orientation }: { orientation: "vertical" | "horizontal" }) {
    const isHorizontal = orientation === "horizontal";

    return (
        <div className={`orientation-illustration ${orientation}`}>
            {isHorizontal && (
                <div className="tab-bar full-width">
                    <div className="tab active" />
                    <div className="tab" />
                    <div className="tab" />
                </div>
            )}
            {isHorizontal && (
                <div className="launcher-bar horizontal">
                    <Icon icon="bx bx-menu" />
                    <Icon icon="bx bx-send" />
                    <Icon icon="bx bx-file-blank" />
                    <Icon icon="bx bx-search" />
                </div>
            )}
            <div className="main-area">
                {!isHorizontal && (
                    <div className="launcher-bar vertical">
                        <Icon icon="bx bx-menu" />
                        <Icon icon="bx bx-send" />
                        <Icon icon="bx bx-file-blank" />
                        <Icon icon="bx bx-search" />
                    </div>
                )}
                <div className="tree-pane">
                    <div className="tree-content" />
                </div>
                <div className="content-pane">
                    {!isHorizontal && (
                        <div className="tab-bar">
                            <div className="tab active" />
                            <div className="tab" />
                            <div className="tab" />
                        </div>
                    )}
                    <div className="note-content" />
                </div>
            </div>
        </div>
    );
}

function ApplicationTheme() {
    const [ theme, setTheme ] = useTriliumOption("theme", true);
    const [ themes, setThemes ] = useState<Theme[]>([]);

    useEffect(() => {
        server.get<Theme[]>("options/user-themes").then((userThemes) => {
            setThemes([
                ...BUILTIN_THEMES,
                ...userThemes
            ]);
        });
    }, []);

    return (
        <OptionsSection title={t("theme.title")}>
            <FormGroup name="theme" label={t("theme.theme_label")} className="col-md-6">
                <FormSelect
                    values={themes} currentValue={theme} onChange={setTheme}
                    keyProperty="val" titleProperty="title"
                />
            </FormGroup>
        </OptionsSection>
    );
}

function Fonts() {
    const [ overrideThemeFonts, setOverrideThemeFonts ] = useTriliumOptionBool("overrideThemeFonts");
    const isEnabled = overrideThemeFonts === true;

    return (
        <OptionsSection title={t("fonts.fonts")}>
            <OptionsRowWithToggle
                name="override-theme-fonts"
                label={t("fonts.custom_fonts")}
                description={t("fonts.not_all_fonts_available")}
                currentValue={overrideThemeFonts}
                onChange={setOverrideThemeFonts}
            />

            <Font name="main-font" label={t("fonts.main_font")} fontFamilyOption="mainFontFamily" fontSizeOption="mainFontSize" disabled={!isEnabled} />
            <Font name="tree-font" label={t("fonts.note_tree_font")} description={t("fonts.size_relative_to_general")} fontFamilyOption="treeFontFamily" fontSizeOption="treeFontSize" disabled={!isEnabled} />
            <Font name="detail-font" label={t("fonts.note_detail_font")} description={t("fonts.size_relative_to_general")} fontFamilyOption="detailFontFamily" fontSizeOption="detailFontSize" disabled={!isEnabled} />
            <Font name="monospace-font" label={t("fonts.monospace_font")} fontFamilyOption="monospaceFontFamily" fontSizeOption="monospaceFontSize" disabled={!isEnabled} />

            <OptionsRowWithButton
                label={t("fonts.apply_changes")}
                icon="bx bx-refresh"
                onClick={reloadFrontendApp}
            />
        </OptionsSection>
    );
}

interface FontProps {
    name: string;
    label: string;
    description?: string;
    fontFamilyOption: OptionNames;
    fontSizeOption: OptionNames;
    disabled?: boolean;
}

function Font({ name, label, description, fontFamilyOption, fontSizeOption, disabled }: FontProps) {
    const [ fontFamily, setFontFamily ] = useTriliumOption(fontFamilyOption);
    const [ fontSize, setFontSize ] = useTriliumOption(fontSizeOption);
    const [ showModal, setShowModal ] = useState(false);

    // Find the current font entry to display
    const currentFont = FONT_FAMILIES
        .flatMap(group => group.items)
        .find(item => item.value === fontFamily);
    const displayLabel = currentFont?.label ?? currentFont?.value ?? fontFamily ?? "";

    // Get the CSS font-family value for preview
    const getFontFamily = (value: string) => {
        if (["theme", "system"].includes(value)) {
            return undefined;
        }
        return value;
    };

    return (
        <OptionsRow name={name} label={label} description={description}>
            <>
                <button
                    type="button"
                    className="btn select-button font-picker-button"
                    onClick={() => setShowModal(true)}
                    disabled={disabled}
                >
                    <span style={{ fontFamily: getFontFamily(fontFamily ?? "") }}>{displayLabel}</span>
                    <span style={{ opacity: 0.6 }}>{fontSize}%</span>
                </button>

                <FontPickerModal
                    show={showModal}
                    onHidden={() => setShowModal(false)}
                    title={label}
                    fontFamily={fontFamily ?? ""}
                    fontSize={parseInt(fontSize ?? "100", 10)}
                    onFontFamilyChange={setFontFamily}
                    onFontSizeChange={(size) => setFontSize(String(size))}
                    getFontFamily={getFontFamily}
                />
            </>
        </OptionsRow>
    );
}

const PREVIEW_TEXT = "The quick brown fox jumps over the lazy dog. 0123456789";

interface FontPickerModalProps {
    show: boolean;
    onHidden: () => void;
    title: string;
    fontFamily: string;
    fontSize: number;
    onFontFamilyChange: (value: string) => void;
    onFontSizeChange: (value: number) => void;
    getFontFamily: (value: string) => string | undefined;
}

function FontPickerModal({ show, onHidden, title, fontFamily, fontSize, onFontFamilyChange, onFontSizeChange, getFontFamily }: FontPickerModalProps) {
    return (
        <Modal
            className="font-picker-modal"
            title={title}
            size="lg"
            show={show}
            onHidden={onHidden}
        >
            <div className="font-picker-content">
                <div className="font-picker-list">
                    <FormList fullHeight>
                        {FONT_FAMILIES.map(group => (
                            <Fragment key={group.title}>
                                <FormListHeader text={group.title} />
                                {group.items.map(item => (
                                    <FormListItem
                                        key={item.value}
                                        onClick={() => onFontFamilyChange(item.value)}
                                        checked={fontFamily === item.value}
                                        selected={fontFamily === item.value}
                                    >
                                        <span style={{ fontFamily: getFontFamily(item.value) }}>
                                            {item.label ?? item.value}
                                        </span>
                                    </FormListItem>
                                ))}
                            </Fragment>
                        ))}
                    </FormList>
                </div>

                <div className="font-picker-settings">
                    <div className="font-size-control">
                        <label>{t("fonts.size")}</label>
                        <div className="font-size-slider">
                            <Slider
                                value={fontSize}
                                onChange={onFontSizeChange}
                                min={50}
                                max={200}
                                step={5}
                            />
                            <span className="font-size-value">{fontSize}%</span>
                        </div>
                    </div>

                    <div className="font-preview">
                        <label>{t("fonts.preview")}</label>
                        <div
                            className="font-preview-text"
                            style={{
                                fontFamily: getFontFamily(fontFamily),
                                fontSize: `${fontSize}%`
                            }}
                        >
                            {PREVIEW_TEXT}
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function ElectronIntegration() {
    const [ zoomFactor ] = useTriliumOption("zoomFactor");
    const [ nativeTitleBarVisible, setNativeTitleBarVisible ] = useTriliumOptionBool("nativeTitleBarVisible");
    const [ backgroundEffects, setBackgroundEffects ] = useTriliumOptionBool("backgroundEffects");

    const zoomPercentage = Math.round(parseFloat(zoomFactor || "1") * 100);

    return (
        <OptionsSection title={t("electron_integration.desktop-application")}>
            <OptionsRow name="zoom-factor" label={t("electron_integration.zoom-factor")} description={t("zoom_factor.description")}>
                <FormTextBoxWithUnit
                    type="number"
                    min={50} max={200} step={10}
                    currentValue={String(zoomPercentage)}
                    onChange={(v) => zoomService.setZoomFactorAndSave(parseInt(v, 10) / 100)}
                    unit={t("units.percentage")}
                />
            </OptionsRow>

            <FormGroup name="native-title-bar" description={t("electron_integration.native-title-bar-description")}>
                <FormCheckbox
                    label={t("electron_integration.native-title-bar")}
                    currentValue={nativeTitleBarVisible} onChange={setNativeTitleBarVisible}
                />
            </FormGroup>

            <FormGroup name="background-effects" description={t("electron_integration.background-effects-description")}>
                <FormCheckbox
                    label={<>
                        {t("electron_integration.background-effects")}
                        {" "}
                        <PlatformIndicator windows="11" mac />
                    </>}
                    currentValue={backgroundEffects} onChange={setBackgroundEffects}
                    disabled={nativeTitleBarVisible}
                />
            </FormGroup>

            <Button text={t("electron_integration.restart-app-button")} onClick={restartDesktopApp} />
        </OptionsSection>
    );
}

function Performance() {
    const [ motionEnabled, setMotionEnabled ] = useTriliumOptionBool("motionEnabled");
    const [ shadowsEnabled, setShadowsEnabled ] = useTriliumOptionBool("shadowsEnabled");
    const [ backdropEffectsEnabled, setBackdropEffectsEnabled ] = useTriliumOptionBool("backdropEffectsEnabled");

    return <OptionsSection title={t("ui-performance.title")}>
        <FormCheckbox
            label={t("ui-performance.enable-motion")}
            currentValue={motionEnabled} onChange={setMotionEnabled}
        />

        <FormCheckbox
            label={t("ui-performance.enable-shadows")}
            currentValue={shadowsEnabled} onChange={setShadowsEnabled}
        />

        {!isMobile() && <FormCheckbox
            label={t("ui-performance.enable-backdrop-effects")}
            currentValue={backdropEffectsEnabled} onChange={setBackdropEffectsEnabled}
        />}

        {isElectron() && <SmoothScrollEnabledOption />}

    </OptionsSection>;
}

function SmoothScrollEnabledOption() {
    const [ smoothScrollEnabled, setSmoothScrollEnabled ] = useTriliumOptionBool("smoothScrollEnabled");

    return <FormCheckbox
        label={`${t("ui-performance.enable-smooth-scroll")} ${t("ui-performance.app-restart-required")}`}
        currentValue={smoothScrollEnabled} onChange={setSmoothScrollEnabled}
    />;
}

function MaxContentWidth() {
    const [maxContentWidth, setMaxContentWidth] = useTriliumOption("maxContentWidth");
    const [centerContent, setCenterContent] = useTriliumOptionBool("centerContent");

    return (
        <OptionsSection title={t("max_content_width.title")}>
            <FormText>{t("max_content_width.default_description")}</FormText>

            <Column md={6}>
                <FormGroup name="max-content-width" label={t("max_content_width.max_width_label")}>
                    <FormTextBoxWithUnit
                        type="number" min={MIN_CONTENT_WIDTH} step="10"
                        currentValue={maxContentWidth} onBlur={setMaxContentWidth}
                        unit={t("max_content_width.max_width_unit")}
                    />
                </FormGroup>
            </Column>

            <FormCheckbox label={t("max_content_width.centerContent")}
                currentValue={centerContent}
                onChange={setCenterContent} />
        </OptionsSection>
    );
}

function RibbonOptions() {
    const [ editedNotesOpenInRibbon, setEditedNotesOpenInRibbon ] = useTriliumOptionBool("editedNotesOpenInRibbon");

    return (
        <OptionsSection title={t('ribbon.widgets')}>
            <FormCheckbox
                label={t('ribbon.edited_notes_message')}
                currentValue={editedNotesOpenInRibbon} onChange={setEditedNotesOpenInRibbon}
            />
        </OptionsSection>
    );
}
