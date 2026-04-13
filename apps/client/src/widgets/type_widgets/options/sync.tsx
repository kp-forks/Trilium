import { SyncTestResponse } from "@triliumnext/commons";
import { useRef } from "preact/hooks";

import { t } from "../../../services/i18n";
import server from "../../../services/server";
import toast from "../../../services/toast";
import Button from "../../react/Button";
import FormTextBox from "../../react/FormTextBox";
import { useTriliumOptions } from "../../react/hooks";
import OptionsRow, { OptionsRowWithButton } from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";
import TimeSelector from "./components/TimeSelector";

export default function SyncOptions() {
    return <SyncConfiguration />;
}

export function SyncConfiguration() {
    const [ options, setOptions ] = useTriliumOptions("syncServerHost", "syncProxy");
    const syncServerHost = useRef(options.syncServerHost);
    const syncProxy = useRef(options.syncProxy);

    return (
        <OptionsSection helpUrl="cbkrhQjrkKrh">
            <form onSubmit={(e) => {
                setOptions({
                    syncServerHost: syncServerHost.current,
                    syncProxy: syncProxy.current
                });
                e.preventDefault();
            }}>
                <OptionsRow name="sync-server-host" label={t("sync_2.server_address")} description={t("sync_2.server_address_description")} stacked>
                    <FormTextBox
                        placeholder="https://<host>:<port>"
                        currentValue={syncServerHost.current} onChange={(newValue) => syncServerHost.current = newValue}
                    />
                </OptionsRow>

                <OptionsRow name="sync-proxy" label={t("sync_2.proxy_label")} description={t("sync_2.proxy_description")} stacked>
                    <FormTextBox
                        placeholder="https://<host>:<port>"
                        currentValue={syncProxy.current} onChange={(newValue) => syncProxy.current = newValue}
                    />
                </OptionsRow>

                <OptionsRow name="save-sync-config" centered>
                    <Button text={t("sync_2.save")} kind="primary" />
                </OptionsRow>
            </form>

            <OptionsRow name="sync-server-timeout" label={t("sync_2.timeout")} description={t("sync_2.timeout_description")}>
                <TimeSelector
                    name="sync-server-timeout"
                    optionValueId="syncServerTimeout"
                    optionTimeScaleId="syncServerTimeoutTimeScale"
                    minimumSeconds={1}
                />
            </OptionsRow>

            <OptionsRowWithButton
                label={t("sync_2.test_button")}
                description={t("sync_2.test_description")}
                onClick={async () => {
                    const result = await server.post<SyncTestResponse>("sync/test");

                    if (result.success && result.message) {
                        toast.showMessage(result.message);
                    } else {
                        toast.showError(t("sync_2.handshake_failed", { message: result.message }));
                    }
                }}
            />
        </OptionsSection>
    );
}
