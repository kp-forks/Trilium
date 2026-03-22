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
import logo from "../../assets/icon.png";
import { Card, CardSection } from "../react/Card.js";
import "./about.css";
import { Trans } from "react-i18next";
import type React from "react";

export default function AboutDialog() {
    const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
    const [shown, setShown] = useState(false);

    useTriliumEvent("openAboutDialog", () => setShown(true));

    return (
        <Modal className="about-dialog"
            size="md"
            show={shown}
            onShown={async () => {
                const appInfo = await server.get<AppInfo>("app-info");
                setAppInfo(appInfo);
            }}
            onHidden={() => setShown(false)}
        >
           <div className="about-dialog-content">

                <img src={logo} width="128" />
                <h2>Trilium Notes</h2>
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
                    {/* https://phosphoricons.com/?q=github */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="#000000" viewBox="0 0 256 256"><path d="M208.31,75.68A59.78,59.78,0,0,0,202.93,28,8,8,0,0,0,196,24a59.75,59.75,0,0,0-48,24H124A59.75,59.75,0,0,0,76,24a8,8,0,0,0-6.93,4,59.78,59.78,0,0,0-5.38,47.68A58.14,58.14,0,0,0,56,104v8a56.06,56.06,0,0,0,48.44,55.47A39.8,39.8,0,0,0,96,192v8H72a24,24,0,0,1-24-24A40,40,0,0,0,8,136a8,8,0,0,0,0,16,24,24,0,0,1,24,24,40,40,0,0,0,40,40H96v16a8,8,0,0,0,16,0V192a24,24,0,0,1,48,0v40a8,8,0,0,0,16,0V192a39.8,39.8,0,0,0-8.44-24.53A56.06,56.06,0,0,0,216,112v-8A58.14,58.14,0,0,0,208.31,75.68ZM200,112a40,40,0,0,1-40,40H112a40,40,0,0,1-40-40v-8a41.74,41.74,0,0,1,6.9-22.48A8,8,0,0,0,80,73.83a43.81,43.81,0,0,1,.79-33.58,43.88,43.88,0,0,1,32.32,20.06A8,8,0,0,0,119.82,64h32.35a8,8,0,0,0,6.74-3.69,43.87,43.87,0,0,1,32.32-20.06A43.81,43.81,0,0,1,192,73.83a8.09,8.09,0,0,0,1,7.65A41.72,41.72,0,0,1,200,104Z"></path></svg>
                    GitHub
                </a>
                <a href="https://triliumnotes.org/en/support-us" target="_blank">
                    {/* https://phosphoricons.com/?q=heart */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="#000000" viewBox="0 0 256 256"><path d="M178,40c-20.65,0-38.73,8.88-50,23.89C116.73,48.88,98.65,40,78,40a62.07,62.07,0,0,0-62,62c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,228.66,240,172,240,102A62.07,62.07,0,0,0,178,40ZM128,214.8C109.74,204.16,32,155.69,32,102A46.06,46.06,0,0,1,78,56c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,155.61,146.24,204.15,128,214.8Z"></path></svg>
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
