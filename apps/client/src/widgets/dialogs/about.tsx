import Modal from "../react/Modal.js";
import { t } from "../../services/i18n.js";
import { formatDateTime } from "../../utils/formatters.js";
import server from "../../services/server.js";
import utils from "../../services/utils.js";
import openService from "../../services/open.js";
import { useState, useCallback, useRef } from "preact/hooks";
import type { AppInfo, Contributor, ContributorList } from "@triliumnext/commons";
import { useTooltip, useTriliumEvent } from "../react/hooks.jsx";
import "./about.css";
import { Trans } from "react-i18next";
import type React from "react";
import contributors from "../../../../../contributors.json"; 
import { Fragment } from "preact/jsx-runtime";
import { ComponentChildren } from "preact";
import clsx from "clsx";

export default function AboutDialog() {
    const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
    const [shown, setShown] = useState(false);
    const [isNightly, setNightly] = useState(false);
    const iconRef = useRef<HTMLDivElement>(null);

    const onLoad = useCallback(async () => {
        if (!appInfo) {
            const info = await server.get<AppInfo>("app-info");
            if (info.appVersion.includes("test")) {
                setNightly(true);
                setAltIcon("nightly");
            }
            setAppInfo(info);
        }
        setShown(true);
    }, []);

    useTriliumEvent("openAboutDialog", onLoad);

    const setAltIcon = useCallback((iconId: string | null) => {
        /* The alternate icon is set by directly accessing the DOM to prevent the dialog being
         * rerendered. A rerender while an element is hovered and displaying a tooltip in the same
         * time, will cause the tooltip to break. */
        if (iconId) {
            iconRef.current?.setAttribute("data-alt-icon", iconId);
        } else {
            iconRef.current?.removeAttribute("data-alt-icon");
        }
    }, []);

    const createContributorHoverHandler = useCallback(() => {
        let timeoutID;
        return (contributor: Contributor, isHovering: boolean) => {
            if (contributor.role === "original-dev") {
                if (isHovering) {
                    timeoutID = setTimeout(() => {
                        setAltIcon("classic");
                    }, 500);
                } else {
                    clearTimeout(timeoutID);
                    setAltIcon(null);
                }
            }
        }
    }, []);

    return (
        <Modal
            className={"about-dialog"}
            size="md"
            show={shown}
            onHidden={() => setShown(false)}
        >
           <div className="about-dialog-content">
               
                <div ref={iconRef} className={"icon"} />
                <h2>Trilium Notes {isNightly && <span className="channel-name">Nightly</span>}</h2>
                <a className="tn-link" href="https://triliumnotes.org/" target="_blank">
                    triliumnotes.org
                </a>

                <table className="property-sheet-table">
                    <tr>
                        <td>{t("about.version_label")}</td>
                        <td  className="selectable-text">
                            {t("about.version", {
                                appVersion: appInfo?.appVersion,
                                dbVersion: appInfo?.dbVersion,
                                syncVersion: appInfo?.syncVersion
                            })}
                            <div className="build-info">
                                <Trans
                                    i18nKey="about.build_info"
                                    values={{
                                        buildDate: appInfo?.buildDate ? formatDateTime(appInfo.buildDate) : ""
                                    }}
                                    components={{
                                        buildRevision: RevisionLink(appInfo)
                                    }}
                                />
                            </div>
                        </td>
                    </tr>
                   
                    <tr>
                        <td>{t("about.contributors_label")}</td>
                        <td className="contributor-list use-tn-links">
                            <Contributors 
                                data={contributors as ContributorList}
                                onHover={createContributorHoverHandler()}
                            />

                            <a href="https://github.com/TriliumNext/Trilium/graphs/contributors" target="_blank">
                                {t("about.contributor_full_list")}
                            </a>
                        </td>
                    </tr>
                    
                    <tr>
                        <td>{t("about.data_directory")}</td>
                        <td className="selectable-text">
                            {appInfo?.dataDirectory && (<DirectoryLink directory={appInfo.dataDirectory} />)}
                        </td>
                    </tr>
                </table>
           </div>

           <footer>
                <FooterLink 
                    text="GitHub"
                    url="https://github.com/TriliumNext/Trilium"
                    tooltip={t("about.github_tooltip")}>

                    <i class='bx bxl-github'></i>
                </FooterLink>
                
                <FooterLink
                    text="AGPL 3.0"
                    url="https://www.gnu.org/licenses/agpl-3.0.en.html#license-text"
                    tooltip={t("about.license_tooltip")}>

                    {/* https://pictogrammers.com/library/mdi/icon/scale-balance/ */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12,3C10.73,3 9.6,3.8 9.18,5H3V7H4.95L2,14C1.53,16 3,17 5.5,17C8,17 9.56,16 9,14L6.05,7H9.17C9.5,7.85 10.15,8.5 11,8.83V20H2V22H22V20H13V8.82C13.85,8.5 14.5,7.85 14.82,7H17.95L15,14C14.53,16 16,17 18.5,17C21,17 22.56,16 22,14L19.05,7H21V5H14.83C14.4,3.8 13.27,3 12,3M12,5A1,1 0 0,1 13,6A1,1 0 0,1 12,7A1,1 0 0,1 11,6A1,1 0 0,1 12,5M5.5,10.25L7,14H4L5.5,10.25M18.5,10.25L20,14H17L18.5,10.25Z" /></svg>
                </FooterLink>

                <FooterLink
                    text={t("about.donate")}
                    url="https://triliumnotes.org/en/support-us"
                    tooltip={t("about.donate_tooltip")}
                    className="donate-link">

                    <i class='bx bx-heart' ></i>
                </FooterLink>
           </footer>
        </Modal>
    );
}

function RevisionLink(appInfo: AppInfo | null) {
    return <>
        {appInfo?.buildRevision && <a href={`https://github.com/TriliumNext/Trilium/commit/${appInfo.buildRevision}`} target="_blank" className="tn-link">
            {appInfo.buildRevision.substring(0, 7)}
        </a>}
    </> as React.ReactElement;
}

function FooterLink(props: {children: ComponentChildren, text: string, url: string, tooltip: string, className?: string}) {
    
    const linkRef = useRef<HTMLAnchorElement>(null);

    useTooltip(linkRef, {
        title: props.tooltip,
        delay: 250,
        placement: "bottom"
    })
    
    return <a ref={linkRef} href={props.url} className={props.className} target="_blank" draggable={false}>
        {props.children}
        {props.text}
    </a>
}

type HoverCallback = (contributor: Contributor, isHovering: boolean) => void;

function Contributors({data, onHover}: {data: ContributorList, onHover?: HoverCallback}) {
    return data.contributors.slice(0, 10).map((c, index, array) => {
        return <Fragment key={c.name}>
            <ContributorListItem data={c} onHover={onHover} />
            
            {/* Add a comma between items */}
            {(index < array.length - 1) ? ", " : ". "}
        </Fragment>
    });
}


function ContributorListItem({data, onHover}: {data: Contributor, onHover?: HoverCallback}) {
    const linkRef = useRef<HTMLAnchorElement>(null);
    const roleString = (data.role) ? t(`about.contributor_roles.${data.role}`) : "";

    useTooltip(linkRef, (data.role) ? {
        title: t(`about.role_brief_history.${data.role}`),
        placement: "bottom",
        offset: [0, 10],
        delay: 500
    }: {});

    return <>
        <a
            ref={linkRef}
            className={clsx({"has-tooltip": !!data.role})}
            href={data.url}
            target="_blank"
            onMouseEnter={(e) => onHover?.(data, true)}
            onMouseLeave={(e) => onHover?.(data, false)}>

            {data.fullName ?? data.name}
        </a>

        {roleString && <span>&nbsp;({roleString})</span>} 
    </>
}

function DirectoryLink({ directory }: { directory: string}) {
    if (utils.isElectron()) {
        const onClick = (e: MouseEvent) => {
            e.preventDefault();
            openService.openDirectory(directory);
        };

        return <a className="tn-link selectable-text" href="#" onClick={onClick}>{directory}</a>
    } else {
        return <span className="selectable-text">{directory}</span>;
    }
}