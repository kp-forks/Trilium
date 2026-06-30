import "./index.css";

import { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Trans, useTranslation } from 'react-i18next';

import botIcon from "../../assets/boxicons/bx-bot.svg?raw";
import calendarIcon from "../../assets/boxicons/bx-calendar.svg?raw";
import hoistingIcon from "../../assets/boxicons/bx-chevrons-up.svg?raw";
import codeIcon from "../../assets/boxicons/bx-code.svg?raw";
import scriptApiIcon from "../../assets/boxicons/bx-code-alt.svg?raw";
import aiToolsIcon from "../../assets/boxicons/bx-cog.svg?raw";
import boardIcon from "../../assets/boxicons/bx-columns-3.svg?raw";
import dashboardIcon from "../../assets/boxicons/bx-dashboard.svg?raw";
import dockerIcon from "../../assets/boxicons/bx-docker.svg?raw";
import templatesIcon from "../../assets/boxicons/bx-duplicate.svg?raw";
import exportIcon from "../../assets/boxicons/bx-export.svg?raw";
import restApiIcon from "../../assets/boxicons/bx-extension.svg?raw";
import fileIcon from "../../assets/boxicons/bx-file.svg?raw";
import authIcon from "../../assets/boxicons/bx-fingerprint.svg?raw";
import noteStructureIcon from "../../assets/boxicons/bx-folder.svg?raw";
import gitHubIcon from "../../assets/boxicons/bx-github.svg?raw";
import shareIcon from "../../assets/boxicons/bx-globe.svg?raw";
import revisionsIcon from "../../assets/boxicons/bx-history.svg?raw";
import importIcon from "../../assets/boxicons/bx-import.svg?raw";
import apiKeyIcon from "../../assets/boxicons/bx-key.svg?raw";
import widgetsIcon from "../../assets/boxicons/bx-layout.svg?raw";
import geomapIcon from "../../assets/boxicons/bx-map.svg?raw";
import mindmapIcon from "../../assets/boxicons/bx-network-chart.svg?raw";
import textNoteIcon from "../../assets/boxicons/bx-note.svg?raw";
import webClipperIcon from "../../assets/boxicons/bx-paperclip.svg?raw";
import canvasIcon from "../../assets/boxicons/bx-pen.svg?raw";
import printerIcon from "../../assets/boxicons/bx-printer.svg?raw";
import syncIcon from "../../assets/boxicons/bx-refresh-cw.svg?raw";
import searchIcon from "../../assets/boxicons/bx-search.svg?raw";
import backendIcon from "../../assets/boxicons/bx-server.svg?raw";
import protectedNotesIcon from "../../assets/boxicons/bx-shield.svg?raw";
import presentationIcon from "../../assets/boxicons/bx-slideshow.svg?raw";
import tableIcon from "../../assets/boxicons/bx-table.svg?raw";
import attributesIcon from "../../assets/boxicons/bx-tag.svg?raw";
import mermaidIcon from "../../assets/boxicons/bx-vector-square.svg?raw";
import renderIcon from "../../assets/boxicons/bx-window-alt.svg?raw";
import markdownIcon from "../../assets/boxicons/bxs-markdown.svg?raw";
import anytypeIcon from "../../assets/import/anytype.svg?raw";
import evernoteIcon from "../../assets/import/evernote.svg?raw";
import keepIcon from "../../assets/import/keep.svg?raw";
import notionIcon from "../../assets/import/notion.svg?raw";
import obsidianIcon from "../../assets/import/obsidian.svg?raw";
import oneNoteIcon from "../../assets/import/onenote.svg?raw";
import Button, { Link } from '../../components/Button.js';
import Card from '../../components/Card.js';
import DownloadButton from '../../components/DownloadButton.js';
import Icon from '../../components/Icon.js';
import Section from '../../components/Section.js';
import { getPlatform } from '../../download-helper.js';
import { useColorScheme, usePageTitle } from '../../hooks.js';

export function Home() {
    usePageTitle("");

    return (
        <>
            <HeroSection />
            <OrganizationBenefitsSection />
            <ProductivityBenefitsSection />
            <NoteTypesSection />
            <ImportSection />
            <CollectionsSection />
            <ScriptingSection />
            <AiIntegrationSection />
            <FaqSection />
            <FinalCta />
        </>
    );
}

function HeroSection() {
    const { t } = useTranslation();
    const platform = getPlatform();
    const colorScheme = useColorScheme();
    const [ screenshotUrl, setScreenshotUrl ] = useState<string>();

    useEffect(() => {
        switch (platform) {
            case "macos":
                setScreenshotUrl(`/screenshot_desktop_mac_${colorScheme}.webp`);
                break;
            case "linux":
                setScreenshotUrl(`/screenshot_desktop_linux_${colorScheme}.webp`);
                break;
            case "windows":
            default:
                setScreenshotUrl(`/screenshot_desktop_win_${colorScheme}.webp`);
                break;
        }
    }, [ colorScheme ]);

    return (
        <Section className="hero-section">
            <div class="title-section">
                <h1>{t("hero_section.title")}</h1>
                <p>{t("hero_section.subtitle")}</p>

                <div className="download-wrapper">
                    <DownloadButton big />
                    <Button href="./get-started/" className="mobile-only" text={t("hero_section.get_started")} />
                    <div className="additional-options">
                        <Button iconSvg={gitHubIcon} outline text={t("hero_section.github")} href="https://github.com/TriliumNext/Trilium/" openExternally />
                        <Button iconSvg={dockerIcon} outline text={t("hero_section.dockerhub")} href="https://hub.docker.com/r/triliumnext/trilium" openExternally />
                    </div>
                </div>

            </div>

            <div className="screenshot-container">
                {screenshotUrl && <img class="screenshot" src={screenshotUrl} alt={t("hero_section.screenshot_alt")} />}
            </div>

            <p className="hero-tagline">
                <Link href="https://docs.triliumnotes.org/user-guide/misc/license" openExternally>{t("hero_section.tagline_license")}</Link>
                <span className="dot" aria-hidden="true" />
                <span>{t("hero_section.tagline_no_account")}</span>
                <span className="dot" aria-hidden="true" />
                <span>{t("hero_section.tagline_cross_platform")}</span>
            </p>
        </Section>
    );
}

function OrganizationBenefitsSection() {
    const { t } = useTranslation();
    return (
        <>
            <Section className="benefits organization" title={t("organization_benefits.title")}>
                <div className="organization-split">
                    <div className="organization-screenshot">
                        <img src="/feature_tree.webp" alt={t("organization_benefits.screenshot_alt")} loading="lazy" />
                    </div>
                    <div className="benefits-container organization-cards">
                        <Card iconSvg={noteStructureIcon} title={t("organization_benefits.note_structure_title")} moreInfoUrl="https://docs.triliumnotes.org/user-guide/concepts/notes">{t("organization_benefits.note_structure_description")}</Card>
                        <Card iconSvg={attributesIcon} title={t("organization_benefits.attributes_title")} moreInfoUrl="https://docs.triliumnotes.org/user-guide/advanced-usage/attributes">{t("organization_benefits.attributes_description")}</Card>
                        <Card iconSvg={hoistingIcon} title={t("organization_benefits.hoisting_title")} moreInfoUrl="https://docs.triliumnotes.org/user-guide/concepts/navigation/note-hoisting">{t("organization_benefits.hoisting_description")}</Card>
                    </div>
                </div>
            </Section>
        </>
    );
}

function ProductivityBenefitsSection() {
    const { t } = useTranslation();
    return (
        <>
            <Section className="benefits accented" title={t("productivity_benefits.title")}>
                <div className="benefits-container grid-3-cols">
                    <Card iconSvg={revisionsIcon} title={t("productivity_benefits.revisions_title")} moreInfoUrl="https://docs.triliumnotes.org/user-guide/concepts/notes/note-revisions">{t("productivity_benefits.revisions_content")}</Card>
                    <Card iconSvg={protectedNotesIcon} title={t("productivity_benefits.protected_notes_title")} moreInfoUrl="https://docs.triliumnotes.org/user-guide/concepts/notes/protected-notes">{t("productivity_benefits.protected_notes_content")}</Card>
                    <Card iconSvg={authIcon} title={t("productivity_benefits.auth_title")} moreInfoUrl="https://docs.triliumnotes.org/user-guide/installation/server/authentication">{t("productivity_benefits.auth_content")}</Card>
                    <Card iconSvg={searchIcon} title={t("productivity_benefits.search_title")} moreInfoUrl="https://docs.triliumnotes.org/user-guide/concepts/navigation/search">{t("productivity_benefits.search_content")}</Card>
                    <Card iconSvg={templatesIcon} title={t("productivity_benefits.templates_title")} moreInfoUrl="https://docs.triliumnotes.org/user-guide/advanced-usage/template">{t("productivity_benefits.templates_content")}</Card>
                    <Card iconSvg={webClipperIcon} title={t("productivity_benefits.web_clipper_title")} moreInfoUrl="https://docs.triliumnotes.org/user-guide/setup/web-clipper">{t("productivity_benefits.web_clipper_content")}</Card>
                    <Card iconSvg={syncIcon} title={t("productivity_benefits.sync_title")} moreInfoUrl="https://docs.triliumnotes.org/user-guide/setup/synchronization">{t("productivity_benefits.sync_content")}</Card>
                    <Card iconSvg={shareIcon} title={t("productivity_benefits.share_title")} moreInfoUrl="https://docs.triliumnotes.org/user-guide/advanced-usage/sharing">{t("productivity_benefits.share_content")}</Card>
                    <Card iconSvg={restApiIcon} title={t("productivity_benefits.api_title")} moreInfoUrl="https://docs.triliumnotes.org/user-guide/advanced-usage/etapi">{t("productivity_benefits.api_content")}</Card>
                </div>
            </Section>
        </>
    );
}

function NoteTypesSection() {
    const { t } = useTranslation();
    return (
        <Section className="note-types" title={t("note_types.title")} subtitle={t("note_types.subtitle")}>
            <TabbedShowcase items={[
                {
                    title: t("note_types.text_title"),
                    imageUrl: "/type_text.webp",
                    iconSvg: textNoteIcon,
                    moreInfo: "https://docs.triliumnotes.org/user-guide/note-types/text",
                    description: t("note_types.text_description")
                },
                {
                    title: t("note_types.markdown_title"),
                    imageUrl: "/type_markdown.webp",
                    iconSvg: markdownIcon,
                    moreInfo: "https://docs.triliumnotes.org/user-guide/note-types/markdown",
                    description: t("note_types.markdown_description")
                },
                {
                    title: t("note_types.code_title"),
                    imageUrl: "/type_code.webp",
                    iconSvg: codeIcon,
                    moreInfo: "https://docs.triliumnotes.org/user-guide/note-types/code",
                    description: t("note_types.code_description")
                },
                {
                    title: t("note_types.spreadsheet_title"),
                    imageUrl: "/type_spreadsheet.webp",
                    iconSvg: tableIcon,
                    moreInfo: "https://docs.triliumnotes.org/user-guide/note-types/Spreadsheets",
                    description: t("note_types.spreadsheet_description")
                },
                {
                    title: t("note_types.canvas_title"),
                    imageUrl: "/type_canvas.webp",
                    iconSvg: canvasIcon,
                    moreInfo: "https://docs.triliumnotes.org/user-guide/note-types/canvas",
                    description: t("note_types.canvas_description")
                },
                {
                    title: t("note_types.mermaid_title"),
                    imageUrl: "/type_mermaid.webp",
                    iconSvg: mermaidIcon,
                    moreInfo: "https://docs.triliumnotes.org/user-guide/note-types/mermaid-diagrams",
                    description: t("note_types.mermaid_description")
                },
                {
                    title: t("note_types.mindmap_title"),
                    imageUrl: "/type_mindmap.webp",
                    iconSvg: mindmapIcon,
                    moreInfo: "https://docs.triliumnotes.org/user-guide/note-types/mindmap",
                    description: t("note_types.mindmap_description")
                },
                {
                    title: t("note_types.file_title"),
                    imageUrl: "/type_file.webp",
                    iconSvg: fileIcon,
                    moreInfo: "https://docs.triliumnotes.org/user-guide/note-types/file",
                    description: t("note_types.file_description")
                }
            ]} />
            <p>
                <Trans
                    i18nKey="note_types.others_list"
                    components={[
                        <Link href="https://docs.triliumnotes.org/user-guide/note-types/note-map" openExternally />,
                        <Link href="https://docs.triliumnotes.org/user-guide/note-types/relation-map" openExternally />,
                        <Link href="https://docs.triliumnotes.org/user-guide/note-types/saved-search" openExternally />,
                        <Link href="https://docs.triliumnotes.org/user-guide/note-types/render-note" openExternally />,
                        <Link href="https://docs.triliumnotes.org/user-guide/note-types/webview" openExternally />
                    ]}
                />
            </p>
        </Section>
    );
}

function CollectionsSection() {
    const { t } = useTranslation();
    return (
        <Section className="collections" title={t("collections.title")} subtitle={t("collections.subtitle")}>
            <TabbedShowcase items={[
                {
                    title: t("collections.calendar_title"),
                    imageUrl: "/collection_calendar.webp",
                    iconSvg: calendarIcon,
                    moreInfo: "https://docs.triliumnotes.org/user-guide/collections/calendar",
                    description: t("collections.calendar_description")
                },
                {
                    title: t("collections.table_title"),
                    iconSvg: tableIcon,
                    imageUrl: "/collection_table.webp",
                    moreInfo: "https://docs.triliumnotes.org/user-guide/collections/table",
                    description: t("collections.table_description")
                },
                {
                    title: t("collections.board_title"),
                    iconSvg: boardIcon,
                    imageUrl: "/collection_board.webp",
                    moreInfo: "https://docs.triliumnotes.org/user-guide/collections/kanban-board",
                    description: t("collections.board_description")
                },
                {
                    title: t("collections.geomap_title"),
                    iconSvg: geomapIcon,
                    imageUrl: "/collection_geomap.webp",
                    moreInfo: "https://docs.triliumnotes.org/user-guide/collections/geomap",
                    description: t("collections.geomap_description")
                },
                {
                    title: t("collections.presentation_title"),
                    iconSvg: presentationIcon,
                    imageUrl: "/collection_presentation.webp",
                    moreInfo: "https://docs.triliumnotes.org/user-guide/collections/presentation",
                    description: t("collections.presentation_description")
                },
                {
                    title: t("collections.dashboard_title"),
                    iconSvg: dashboardIcon,
                    imageUrl: "/collection_dashboard.webp",
                    moreInfo: "https://docs.triliumnotes.org/user-guide/collections/Dashboard",
                    description: t("collections.dashboard_description")
                }
            ]} />
        </Section>
    );
}

function AiIntegrationSection() {
    const { t } = useTranslation();
    return (
        <Section className="benefits ai-integration" title={t("ai_integration.title")} subtitle={t("ai_integration.subtitle")} cta={{ text: t("ai_integration.learn_more"), href: "https://docs.triliumnotes.org/user-guide/llm" }}>
            <div className="feature-split">
                <div className="feature-screenshot">
                    <img src="/feature_llm.webp" alt={t("ai_integration.screenshot_alt")} loading="lazy" />
                </div>
                <div className="benefits-container feature-cards">
                    <Card iconSvg={botIcon} title={t("ai_integration.chat_title")}>{t("ai_integration.chat_description")}</Card>
                    <Card iconSvg={aiToolsIcon} title={t("ai_integration.tools_title")}>{t("ai_integration.tools_description")}</Card>
                    <Card iconSvg={apiKeyIcon} title={t("ai_integration.providers_title")}>{t("ai_integration.providers_description")}</Card>
                </div>
            </div>
        </Section>
    );
}

function ScriptingSection() {
    const { t } = useTranslation();
    return (
        <Section className="benefits scripting accented" title={t("scripting.title")} subtitle={t("scripting.subtitle")} cta={{ text: t("scripting.learn_more"), href: "https://docs.triliumnotes.org/user-guide/scripts" }}>
            <div className="feature-split">
                <div className="feature-screenshot">
                    <img src="/feature_scripting.webp" alt={t("scripting.screenshot_alt")} loading="lazy" />
                </div>
                <div className="benefits-container feature-cards">
                    <Card iconSvg={widgetsIcon} title={t("scripting.widgets_title")}>{t("scripting.widgets_description")}</Card>
                    <Card iconSvg={backendIcon} title={t("scripting.backend_title")}>{t("scripting.backend_description")}</Card>
                    <Card iconSvg={renderIcon} title={t("scripting.render_title")}>{t("scripting.render_description")}</Card>
                    <Card iconSvg={scriptApiIcon} title={t("scripting.api_title")}>{t("scripting.api_description")}</Card>
                </div>
            </div>
        </Section>
    );
}

function ImportSection() {
    const { t } = useTranslation();
    return (
        <Section className="benefits import accented" title={t("import.title")} subtitle={t("import.subtitle")} cta={{ text: t("import.learn_more"), href: "https://docs.triliumnotes.org/user-guide/concepts/import-export" }}>
            <div className="benefits-container grid-3-cols">
                <Card iconSvg={importIcon} title={t("import.pillar_import_title")}>{t("import.pillar_import_description")}</Card>
                <Card iconSvg={exportIcon} title={t("import.pillar_export_title")}>{t("import.pillar_export_description")}</Card>
                <Card iconSvg={printerIcon} title={t("import.pillar_pdf_title")}>{t("import.pillar_pdf_description")}</Card>
            </div>

            <div className="import-logos">
                <span className="import-logos-label">{t("import.sources_label")}</span>
                <div className="import-logos-row">
                    <span className="import-logo" title={t("import.onenote_title")}><Icon svg={oneNoteIcon} /></span>
                    <span className="import-logo" title={t("import.notion_title")}><Icon svg={notionIcon} /></span>
                    <span className="import-logo" title={t("import.keep_title")}><Icon svg={keepIcon} /></span>
                    <span className="import-logo" title={t("import.evernote_title")}><Icon svg={evernoteIcon} /></span>
                    <span className="import-logo" title={t("import.anytype_title")}><Icon svg={anytypeIcon} /></span>
                    <span className="import-logo" title={t("import.obsidian_title")}><Icon svg={obsidianIcon} /></span>
                </div>
            </div>
        </Section>
    );
}

interface ShowcaseItem {
    title: string;
    imageUrl: string;
    description: string;
    moreInfo: string;
    iconSvg?: string;
}

function TabbedShowcase({ items }: { items: ShowcaseItem[] }) {
    const { t } = useTranslation();
    const [ activeIndex, setActiveIndex ] = useState(0);
    const active = items[activeIndex];

    return (
        <div className="tabbed-showcase">
            <ul className="showcase-tabs" role="tablist">
                {items.map((item, index) => {
                    const isActive = index === activeIndex;
                    return (
                        <li role="presentation" key={item.title}>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                className={`showcase-tab ${isActive ? "active" : ""}`}
                                onClick={() => setActiveIndex(index)}
                                onMouseEnter={() => setActiveIndex(index)}
                                onFocus={() => setActiveIndex(index)}
                            >
                                {item.iconSvg && <span className="tab-icon"><Icon svg={item.iconSvg} /></span>}
                                <span className="tab-label">{item.title}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            <div className="showcase-preview" key={activeIndex} role="tabpanel">
                <div className="showcase-image-frame">
                    <img src={active.imageUrl} alt={active.title} loading="lazy" />
                </div>
                <div className="showcase-details">
                    <h3>{active.title}</h3>
                    <p>{active.description}</p>
                    <Link href={active.moreInfo} className="more-info" openExternally>{t("components.link_learn_more")}</Link>
                </div>
            </div>
        </div>
    );
}

function FaqSection() {
    const { t } = useTranslation();
    return (
        <Section className="faq" title={t("faq.title")}>
            <div className="faq-list">
                <FaqItem question={t("faq.free_question")}>{t("faq.free_answer")}</FaqItem>
                <FaqItem question={t("faq.mobile_question")}>{t("faq.mobile_answer")}</FaqItem>
                <FaqItem question={t("faq.server_question")}>{t("faq.server_answer")}</FaqItem>
                <FaqItem question={t("faq.cloud_question")}>
                    <Trans
                        i18nKey="faq.cloud_answer"
                        components={[
                            <Link key="pikapods" href="https://www.pikapods.com/pods?run=trilium-next" openExternally />
                        ]}
                    />
                </FaqItem>
                <FaqItem question={t("faq.collaboration_question")}>{t("faq.collaboration_answer")}</FaqItem>
                <FaqItem question={t("faq.database_question")}>{t("faq.database_answer")}</FaqItem>
                <FaqItem question={t("faq.scaling_question")}>{t("faq.scaling_answer")}</FaqItem>
                <FaqItem question={t("faq.network_share_question")}>{t("faq.network_share_answer")}</FaqItem>
                <FaqItem question={t("faq.security_question")}>{t("faq.security_answer")}</FaqItem>
            </div>

            <p className="faq-more">
                <Trans
                    i18nKey="faq.more_questions"
                    components={[
                        <Link key="discussions" href="https://github.com/orgs/TriliumNext/discussions" openExternally />
                    ]}
                />
            </p>
        </Section>
    );
}

function FaqItem({ question, children }: { question: string; children: ComponentChildren }) {
    return (
        <details className="faq-item">
            <summary>{question}</summary>
            <div className="faq-answer">{children}</div>
        </details>
    );
}

function FinalCta() {
    const { t } = useTranslation();
    return (
        <Section className="final-cta accented" title={t("final_cta.title")}>
            <p>{t("final_cta.description")}</p>

            <div class="buttons">
                <Button href="./get-started/" text={t("final_cta.get_started")} />
            </div>
        </Section>
    );
}
