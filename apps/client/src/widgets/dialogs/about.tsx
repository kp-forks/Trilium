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
           <div>
                <img src={logo} width="128" />
                <h2>Trilium Notes</h2>
                <a className="tn-link" href="https://triliumnotes.org/" target="_blank">
                    triliumnotes.org
                </a>
                
                <Card className="property-sheet-card">
                    <CardSection>
                        <div>{t("about.version_label")}</div>
                        <div>
                            {t("about.version", {
                                appVersion: appInfo?.appVersion,
                                dbVersion: appInfo?.dbVersion,
                                syncVersion: appInfo?.syncVersion
                            })}
                            <div>
                                {t("about.build_info", {
                                    buildDate: appInfo?.buildDate ? formatDateTime(appInfo.buildDate) : "",
                                    buildRevision: appInfo?.buildRevision ? appInfo.buildRevision.substring(0, 6) : ""
                                })}
                            </div>
                        </div>
                    </CardSection>
                    <CardSection>
                        <div>{t("about.contributors_label")}</div>
                    </CardSection>
                    <CardSection>
                        <div>{t("about.data_directory")}</div>
                        <div>
                            {appInfo?.dataDirectory && (<DirectoryLink directory={appInfo.dataDirectory} />)}
                        </div>
                    </CardSection>
                </Card>
           </div>
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
