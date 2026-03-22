import Modal from "../react/Modal.js";
import { t } from "../../services/i18n.js";
import { formatDateTime } from "../../utils/formatters.js";
import server from "../../services/server.js";
import utils from "../../services/utils.js";
import openService from "../../services/open.js";
import { useState } from "preact/hooks";
import type { CSSProperties } from "preact/compat";
import type { AppInfo } from "@triliumnext/commons";
import { useTriliumEvent } from "../react/hooks.jsx";
import { Card, CardSection } from "../react/Card.js";
import "./about.css";
import { Trans } from "react-i18next";
import type React from "react";
import icon from "../../assets/icon.svg";
import iconAlt from "../../assets/icon-alt.svg";
import { useCallback, useEffect } from "react";

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
        <Modal className="about-dialog"
            size="md"
            show={shown}
            onHidden={() => setShown(false)}
        >
           <div className="about-dialog-content">

                <img src={(isNightly) ? iconAlt : icon} width="128" />
                <h2>Trilium Notes {isNightly && <span>Nightly</span>}</h2>
                <a className="tn-link" href="https://triliumnotes.org/" target="_blank">
                    triliumnotes.org
                </a>

                <Card className="property-sheet-card">
                    <CardSection>
                        <div>{t("about.version_label")}</div>
                        <div  className="selectable-text">
                            {t("about.version", {
                                appVersion: appInfo?.appVersion,
                                dbVersion: appInfo?.dbVersion,
                                syncVersion: appInfo?.syncVersion
                            })}
                            <div>
                                <Trans
                                    i18nKey="about.build_info"
                                    values={{
                                        buildDate: appInfo?.buildDate ? formatDateTime(appInfo.buildDate) : ""
                                    }}
                                    components={{
                                        buildRevision: <>
                                            {appInfo?.buildRevision && <a href={`https://github.com/TriliumNext/Trilium/commit/${appInfo.buildRevision}`} target="_blank" className="tn-link">
                                                {appInfo.buildRevision.substring(0, 7)}
                                            </a>}
                                        </> as React.ReactElement
                                    }}
                                />
                            </div>
                        </div>
                    </CardSection>
                    <CardSection>
                        <div>{t("about.contributors_label")}</div>
                    </CardSection>
                    <CardSection>
                        <div>{t("about.data_directory")}</div>
                        <div className="selectable-text">
                            {appInfo?.dataDirectory && (<DirectoryLink directory={appInfo.dataDirectory} />)}
                        </div>
                    </CardSection>
                </Card>
           </div>

           <footer>
                <a href="https://github.com/TriliumNext/Trilium" target="_blank">
                    <i class='bx bxl-github'></i>
                    GitHub
                </a>
                <a href="https://triliumnotes.org/en/support-us" target="_blank">
                    <i class='bx bx-heart' ></i>
                    {t("about.donate")}
                </a>
           </footer>
        </Modal>
    );
}

function DirectoryLink({ directory, style }: { directory: string, style?: CSSProperties }) {
    if (utils.isElectron()) {
        const onClick = (e: MouseEvent) => {
            e.preventDefault();
            openService.openDirectory(directory);
        };

        return <a className="tn-link selectable-text" href="#" onClick={onClick} style={style}>{directory}</a>
    } else {
        return <span className="selectable-text" style={style}>{directory}</span>;
    }
}
