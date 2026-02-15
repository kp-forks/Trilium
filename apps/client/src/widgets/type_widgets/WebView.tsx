import "./WebView.css";

import { useCallback, useState } from "preact/hooks";

import FNote from "../../entities/fnote";
import { t } from "../../services/i18n";
import toast from "../../services/toast";
import utils from "../../services/utils";
import Button from "../react/Button";
import FormGroup from "../react/FormGroup";
import { useNoteLabel } from "../react/hooks";
import { TypeWidgetProps } from "./type_widget";

const isElectron = utils.isElectron();

export default function WebView({ note }: TypeWidgetProps) {
    const [ webViewSrc ] = useNoteLabel(note, "webViewSrc");

    return (webViewSrc
        ? <WebViewContent src={webViewSrc} />
        : <SetupWebView note={note} />
    );
}

function WebViewContent({ src }: { src: string }) {
    if (!isElectron) {
        return <iframe src={src} class="note-detail-web-view-content" sandbox="allow-same-origin allow-scripts allow-popups" />;
    }
    return <webview src={src} class="note-detail-web-view-content" />;

}

function SetupWebView({note}: {note: FNote}) {
    const [ , setSrcLabel] = useNoteLabel(note, "webViewSrc");
    const [ src, setSrc ] = useState("");

    const submit = useCallback((url: string) => {
        try {
            // Validate URL
            new URL(url);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (ex) {
            toast.showErrorTitleAndMessage(t("web_view_setup.invalid_url_title"),
                t("web_view_setup.invalid_url_message"));
            return;
        }

        setSrcLabel(url);
    }, [ setSrcLabel ]);

    return <div class="web-view-setup-form">
        <form class="tn-centered-form" onSubmit={() => submit(src)}>
            <span className="bx bx-globe-alt form-icon" />

            <FormGroup name="web-view-src-detail" label={t("web_view_setup.title")}>
                <input className="form-control"
                    type="text"
                    value={src}
                    placeholder={t("web_view_setup.url_placeholder")}
                    onChange={(e) => {setSrc((e.target as HTMLInputElement)?.value);}}
                />
            </FormGroup>

            <Button
                text={t("web_view_setup.create_button")}
                primary
                keyboardShortcut="Enter"
            />
        </form>
    </div>;
}
