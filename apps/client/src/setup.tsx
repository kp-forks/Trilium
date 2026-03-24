import "./setup.css";

import { SetupSyncFromServerResponse } from "@triliumnext/commons";
import { ComponentChildren, render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { initLocale, t } from "./services/i18n";
import server from "./services/server";
import { replaceHtmlEscapedSlashes } from "./services/utils";
import Admonition from "./widgets/react/Admonition";
import Button from "./widgets/react/Button";
import { Card, CardFrame, CardSection } from "./widgets/react/Card";
import Collapsible from "./widgets/react/Collapsible";
import FormTextBox from "./widgets/react/FormTextBox";
import Icon from "./widgets/react/Icon";

async function main() {
    await initLocale();

    const bodyWrapper = document.createElement("div");
    document.body.classList.add("setup");
    render(<App />, bodyWrapper);
    document.body.replaceChildren(bodyWrapper);
}

type State = "firstOptions" | "createNewDocument" | "syncFromDesktop" | "syncFromServer" | "syncInProgress" | "syncFailed";

const STATE_ORDER: State[] = ["firstOptions", "createNewDocument", "syncFromDesktop", "syncFromServer", "syncInProgress", "syncFailed"];

function renderState(state: State, setState: (state: State) => void) {
    switch (state) {
        case "firstOptions": return <SetupOptions setState={setState} />;
        case "createNewDocument": return <CreateNewDocument />;
        case "syncFromServer": return <SyncFromServer setState={setState} />;
        case "syncFromDesktop": return <SyncFromDesktop setState={setState} />;
        case "syncInProgress": return <SyncInProgress />;
        default: return null;
    }
}

function App() {
    const [state, setState] = useState<State>("firstOptions");
    const [prevState, setPrevState] = useState<State | null>(null);
    const [transitioning, setTransitioning] = useState(false);
    const prevStateRef = useRef<State>(state);

    function handleSetState(newState: State) {
        setPrevState(prevStateRef.current);
        prevStateRef.current = newState;
        setTransitioning(true);
        setState(newState);
    }

    const direction = prevState !== null
        ? STATE_ORDER.indexOf(state) > STATE_ORDER.indexOf(prevState) ? "forward" : "backward"
        : "forward";

    return (
        <div class="setup-container">
            {transitioning && prevState !== null && (
                <div
                    class={`slide-page slide-out-${direction}`}
                    onAnimationEnd={() => {
                        setTransitioning(false);
                        setPrevState(null);
                    }}
                >
                    {renderState(prevState, handleSetState)}
                </div>
            )}
            <div class={`slide-page ${transitioning ? `slide-in-${direction}` : "slide-current"}`} key={state}>
                {renderState(state, handleSetState)}
            </div>
        </div>
    );
}

function SetupOptions({ setState }: { setState: (state: State) => void }) {
    return (
        <div class="page setup-options-container">
            <h1>{t("setup.heading")}</h1>

            <main class="setup-options">
                <SetupOptionCard
                    icon="bx bx-file-blank"
                    title={t("setup.new-document")}
                    description={t("setup.new-document-description")}
                    onClick={() => setState("createNewDocument")}
                />

                <SetupOptionCard
                    icon="bx bx-server"
                    title={t("setup.sync-from-server")}
                    description={t("setup.sync-from-server-description")}
                    onClick={() => setState("syncFromServer")}
                />

                <SetupOptionCard
                    icon="bx bx-desktop"
                    title={t("setup.sync-from-desktop")}
                    description={t("setup.sync-from-desktop-description")}
                    onClick={() => setState("syncFromDesktop")}
                />
            </main>
        </div>
    );
}

type SyncStep = "connecting" | "syncing" | "finalizing";

function getSyncStep(stats: { outstandingPullCount: number; totalPullCount: number | null; initialized: boolean }): SyncStep {
    if (stats.initialized) {
        return "finalizing"; // will reload momentarily
    }
    if (stats.totalPullCount !== null && stats.outstandingPullCount > 0) {
        return "syncing";
    }
    if (stats.totalPullCount !== null && stats.outstandingPullCount === 0) {
        return "finalizing";
    }
    return "connecting";
}

function SyncInProgress() {
    const stats = useOutstandingSyncInfo();
    const step = getSyncStep(stats);

    useEffect(() => {
        if (stats.initialized) {
            location.reload();
        }
    }, [stats.initialized]);

    const steps: { key: SyncStep; label: string }[] = [
        { key: "connecting", label: t("setup.sync-step-connecting") },
        { key: "syncing", label: t("setup.sync-step-syncing") },
        { key: "finalizing", label: t("setup.sync-step-finalizing") }
    ];

    const currentIndex = steps.findIndex((s) => s.key === step);

    const progress = stats.totalPullCount
        ? Math.round(((stats.totalPullCount - stats.outstandingPullCount) / stats.totalPullCount) * 100)
        : 0;

    return (
        <div class="page sync-in-progress">
            <h1>{t("setup.sync-in-progress-title")}</h1>

            <ol class="sync-steps">
                {steps.map((s, i) => (
                    <li class={i < currentIndex ? "completed" : i === currentIndex ? "active" : ""} key={s.key}>
                        <Icon icon={i < currentIndex ? "bx bx-check-circle" : i === currentIndex ? "bx bx-loader-circle" : "bx bx-circle"} />{" "}
                        {s.label}
                        {s.key === "syncing" && step === "syncing" && (
                            <div class="sync-progress">
                                <progress value={stats.totalPullCount! - stats.outstandingPullCount} max={stats.totalPullCount!} />
                                <span>{progress}%</span>
                            </div>
                        )}
                    </li>
                ))}
            </ol>
        </div>
    );
}

function useOutstandingSyncInfo() {
    const [ outstandingPullCount, setOutstandingPullCount ] = useState(0);
    const [ totalPullCount, setTotalPullCount ] = useState<number | null>(null);
    const [ initialized, setInitialized ] = useState(false);

    async function refresh() {
        const resp = await server.get<{ outstandingPullCount: number; totalPullCount: number | null; initialized: boolean }>("sync/stats");
        setOutstandingPullCount(resp.outstandingPullCount);
        setTotalPullCount(resp.totalPullCount);
        setInitialized(resp.initialized);
    }

    useEffect(() => {
        const interval = setInterval(refresh, 1000);
        refresh();

        return () => clearInterval(interval);
    }, []);
    return { outstandingPullCount, totalPullCount, initialized };
}

function Spinner() {
    return (
        <div class="lds-ring" style="margin-right: 20px;">
            <div />
            <div />
            <div />
            <div />
        </div>);
}

function CreateNewDocument() {
    useEffect(() => {
        server.post("setup/new-document").then(() => {
            location.reload();
        });
    }, []);

    return (<div class="page create-new-document">
        <h1>{t("setup.create-new-document-title")}</h1>
        <p>{t("setup.create-new-document-description")}</p>

        <Spinner />
    </div>);
}

function SyncFromServer({ setState }: { setState: (state: State) => void }) {
    const [ syncServerHost, setSyncServerHost ] = useState("");
    const [ password, setPassword ] = useState("");
    const [ syncProxy, setSyncProxy ] = useState("");
    const [ error, setError ] = useState<string | null>(null);
    const isValid = syncServerHost.trim() !== "" && password !== "";

    async function handleFinishSetup() {
        try {
            const resp = await server.post<SetupSyncFromServerResponse>("setup/sync-from-server", {
                syncServerHost: syncServerHost.trim(),
                syncProxy: syncProxy.trim(),
                password
            });

            if (resp.result === "success") {
                setState("syncInProgress");
            } else {
                setError(t("setup.sync-failed", { message: resp.error }));
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }

    return (
        <div class="page sync-from-server">
            <SyncIllustration targetDevice="server" />
            <h1>{t("setup.sync-from-server")}</h1>
            <p>{t("setup.sync-from-server-page-description")}</p>

            <main>
                <form>
                    <FormItemWithIcon icon="bx bx-server">
                        <FormTextBox placeholder="https://example.com" currentValue={syncServerHost} onChange={setSyncServerHost} required />
                    </FormItemWithIcon>

                    <FormItemWithIcon icon="bx bx-lock">
                        <FormTextBox placeholder={t("setup.password-placeholder")} type="password" currentValue={password} onChange={setPassword} required />
                    </FormItemWithIcon>

                    <Collapsible title={t("setup.advanced-options")} initiallyExpanded={false}>
                        <FormItemWithIcon icon="bx bx-shape-polygon">
                            <FormTextBox placeholder="http://my-proxy.com:8080" currentValue={syncProxy} onChange={setSyncProxy} />
                        </FormItemWithIcon>
                    </Collapsible>

                    {error && <Admonition className="error" type="caution">{replaceHtmlEscapedSlashes(error)}</Admonition>}
                </form>
            </main>

            <footer>
                <Button text={t("setup.button-back")} onClick={() => setState("firstOptions")} kind="lowProfile" />
                <Button text={t("setup.button-finish-setup")} kind="primary" onClick={handleFinishSetup} disabled={!isValid} />
            </footer>
        </div>
    );
}

function SyncFromDesktop({ setState }: { setState: (state: State) => void }) {
    function handleFinishSetup() {
    }

    return (
        <div class="page sync-from-desktop">
            <SyncIllustration targetDevice="desktop" />
            <h1>{t("setup.sync-from-desktop")}</h1>

            <main>
                <Card heading="On the other device">
                    <CardSection>1. {t("setup.sync-from-desktop-step1")}</CardSection>
                    <CardSection>2. {t("setup.sync-from-desktop-step2")}</CardSection>
                    <CardSection>3. {t("setup.sync-from-desktop-step3")}</CardSection>
                    <CardSection>4. {t("setup.sync-from-desktop-step4", { host: location.host })}</CardSection>
                    <CardSection>5. {t("setup.sync-from-desktop-step5")}</CardSection>

                    {t("setup.sync-from-desktop-final")}
                </Card>
            </main>

            <footer>
                <Button text={t("setup.button-back")} onClick={() => setState("firstOptions")} kind="lowProfile" />
                <Button icon="bx-loader bx-spin" text={t("setup.sync-from-desktop-waiting")} kind="primary" disabled />
            </footer>
        </div>
    );
}

function SyncIllustration({ targetDevice }: { targetDevice: "desktop" | "server" }) {
    return (
        <div class="sync-illustration">
            <div>
                <Icon icon="bx bx-globe" />
                {t("setup.sync-illustration-this-device")}
            </div>
            <div class="sync-illustration-arrows" />
            <div>
                <Icon icon={targetDevice === "desktop" ? "bx bx-desktop" : "bx bx-server"} />
                {targetDevice === "desktop" ? t("setup.sync-illustration-desktop-app") : t("setup.sync-illustration-server")}
            </div>
        </div>
    );
}

function FormItemWithIcon({ icon, children }: { icon: string; children: ComponentChildren }) {
    return (
        <div class="form-item-with-icon">
            <Icon icon={icon} />
            {children}
        </div>
    );
}

function SetupOptionCard({ title, description, icon, onClick }: { title: string; description: string, icon: string, onClick?: () => void }) {
    return (
        <CardFrame className="setup-option-card" onClick={onClick}>
            <Icon icon={icon} />

            <div>
                <h3>{title}</h3>
                <p>{description}</p>
            </div>
        </CardFrame>
    );
}

main();
