import Modal from "../react/Modal.js";
import { t } from "../../services/i18n.js";
import { formatDateTime } from "../../utils/formatters.js";
import server from "../../services/server.js";
import utils from "../../services/utils.js";
import openService from "../../services/open.js";
import { useState } from "preact/hooks";
import type { AppInfo, Contributor, ContributorList } from "@triliumnext/commons";
import { useTriliumEvent } from "../react/hooks.jsx";
import "./about.css";
import { Trans } from "react-i18next";
import type React from "react";
import icon from "../../assets/icon.svg";
import iconAlt from "../../assets/icon-alt.svg";
import { useCallback, useEffect } from "react";
import contributors from "../../../../../contributors.json"; 
import { Fragment } from "preact/jsx-runtime";

export default function AboutDialog() {
    const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
    const [shown, setShown] = useState(false);
    const [isNightly, setNightly] = useState(false);

    const onLoad = useCallback(async () => {
        if (!appInfo) {
            setAppInfo(await server.get<AppInfo>("app-info"));
        }
        setShown(true);
    }, []);

    useTriliumEvent("openAboutDialog", onLoad);

    useEffect(() => {
        setNightly(!!appInfo?.appVersion.includes("test"));
    }, [appInfo])

    return (
        <Modal
            className="about-dialog"
            size="md"
            show={shown}
            onHidden={() => setShown(false)}
        >
           <div className="about-dialog-content">
                <img src={(isNightly) ? iconAlt : icon} width="160" />
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
                                        buildRevision: revisionLink(appInfo)
                                    }}
                                />
                            </div>
                        </td>
                    </tr>
                   
                    <tr>
                        <td>{t("about.contributors_label")}</td>
                        <td className="contributor-list use-tn-links">
                            <Contributors data={contributors as ContributorList} />
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
                <a href="https://github.com/TriliumNext/Trilium" target="_blank">
                    <i class='bx bxl-github'></i>
                    GitHub
                </a>
                
                <a href="https://triliumnotes.org/en/support-us" className="donate-link" target="_blank">
                    <i class='bx bx-heart' ></i>
                    {t("about.donate")}
                </a>
           </footer>
        </Modal>
    );
}

function revisionLink(appInfo: AppInfo | null) {
    return <>
        {appInfo?.buildRevision && <a href={`https://github.com/TriliumNext/Trilium/commit/${appInfo.buildRevision}`} target="_blank" className="tn-link">
            {appInfo.buildRevision.substring(0, 7)}
        </a>}
    </> as React.ReactElement;
}

function Contributors(params: {data: ContributorList}) {
    return params.data.contributors.slice(0, 10).map((c, index, array) => {
        return <Fragment key={c.name}>
            <ContributorListItem data={c} />
            
            {/* Add a comma between items */}
            {(index < array.length - 1) ? ", " : ". "}
        </Fragment>
    });
}

function ContributorListItem({data}: {data: Contributor}) {
    let roleString = "";
    if (data.role) {
        roleString = t(`about.contributor_roles.${data.role}`);
    }

    return <>
        <a href={data.url} target="_blank">{data.fullName ?? data.name}</a>

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