import "./setup.css";

import { SetupSyncFromServerResponse } from "@triliumnext/commons";
import clsx from "clsx";
import { ComponentChildren, render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { initLocale, t } from "./services/i18n";
import server from "./services/server";
import { isElectron, replaceHtmlEscapedSlashes } from "./services/utils";
import ActionButton from "./widgets/react/ActionButton";
import Admonition from "./widgets/react/Admonition";
import Button from "./widgets/react/Button";
import { Card, CardFrame, CardSection } from "./widgets/react/Card";
import Collapsible from "./widgets/react/Collapsible";
import FormGroup from "./widgets/react/FormGroup";
import FormTextBox from "./widgets/react/FormTextBox";
import Icon from "./widgets/react/Icon";

async function main() {
    await initLocale();

    const bodyWrapper = document.createElement("div");
    bodyWrapper.classList.add("setup-outer-wrapper");
    document.body.classList.add("setup");
    render(<App />, bodyWrapper);
    document.body.replaceChildren(bodyWrapper);
}

type State = "firstOptions" | "createNewDocumentOptions" | "createNewDocumentWithDemo" | "createNewDocumentEmpty" | "syncFromDesktop" | "syncFromServer" | "syncInProgress" | "syncFailed";

const STATE_ORDER: State[] = ["firstOptions", "createNewDocumentOptions", "createNewDocumentWithDemo", "createNewDocumentEmpty", "syncFromDesktop", "syncFromServer", "syncInProgress", "syncFailed"];

function renderState(state: State, setState: (state: State) => void) {
    switch (state) {
        case "firstOptions": return <SetupOptions setState={setState} />;
        case "createNewDocumentOptions": return <CreateNewDocumentOptions setState={setState} />;
        case "createNewDocumentWithDemo": return <CreateNewDocumentInProgress withDemo />;
        case "createNewDocumentEmpty": return <CreateNewDocumentInProgress />;
        case "syncFromServer": return <SyncFromServer setState={setState} />;
        case "syncFromDesktop": return <SyncFromDesktop setState={setState} />;
        case "syncInProgress": return <SyncInProgress device="server" />;
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
        <SetupPage title={t("setup.heading")} className="setup-options-container">
            <div class="setup-options">
                <SetupOptionCard
                    icon="bx bx-file-blank"
                    title={t("setup.new-document")}
                    description={t("setup.new-document-description")}
                    onClick={() => setState("createNewDocumentOptions")}
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
                    disabled={glob.isStandalone}
                />
            </div>
        </SetupPage>
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

function SyncInProgress({ device }: { device: "server" | "desktop" }) {
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

    const syncingDone = currentIndex > steps.findIndex((s) => s.key === "syncing");
    let progress = 0;
    if (syncingDone) {
        progress = 100;
    } else if (stats.totalPullCount) {
        progress = Math.round(((stats.totalPullCount - stats.outstandingPullCount) / stats.totalPullCount) * 100);
    }

    return (
        <SetupPage
            className="sync-in-progress"
            illustration={<SyncIllustration targetDevice={device} />}
            title={t("setup.sync-in-progress-title")}
        >
            <Card className="sync-steps">
                {steps.map((s, i) => (
                    <CardSection className={i < currentIndex ? "completed" : i === currentIndex ? "active" : ""} key={s.key}>
                        <Icon icon={i < currentIndex ? "bx bx-check-circle" : i === currentIndex ? "bx bx-loader-circle bx-spin" : "bx bx-circle"} />{" "}
                        {s.label}
                        {s.key === "syncing" && (
                            <div class="sync-progress">
                                <progress value={syncingDone ? 1 : stats.totalPullCount! - stats.outstandingPullCount} max={syncingDone ? 1 : stats.totalPullCount!} />
                                <span>{progress}%</span>
                            </div>
                        )}
                    </CardSection>
                ))}
            </Card>
        </SetupPage>
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

function CreateNewDocumentOptions({ setState }: { setState: (state: State) => void }) {
    return (
        <SetupPage
            className="create-new-document-options"
            title={t("setup.create-new-document-options-title")}
            illustration={<Icon icon="bx bx-star" className="illustration-icon" />}
        >
            <div class="setup-options">
                <SetupOptionCard icon="bx bx-book-open" title={t("setup.create-new-document-options-with-demo")} description={t("setup.create-new-document-options-with-demo-description")} onClick={() => setState("createNewDocumentWithDemo")} />
                <SetupOptionCard icon="bx bx-file-blank" title={t("setup.create-new-document-options-empty")} description={t("setup.create-new-document-options-empty-description")} onClick={() => setState("createNewDocumentEmpty")} />
            </div>
        </SetupPage>
    );
}

function CreateNewDocumentInProgress({ withDemo = false }: { withDemo?: boolean }) {
    useEffect(() => {
        server.post(`setup/new-document${withDemo ? "" : "?skipDemoDb"}`).then(() => {
            location.reload();
        });
    }, []);

    return (
        <SetupPage
            className="create-new-document"
            title={t("setup.create-new-document-title")}
            description={t("setup.create-new-document-description")}
        >
            <Spinner />
        </SetupPage>
    );
}

function SyncFromServer({ setState }: { setState: (state: State) => void }) {
    const [ syncServerHost, setSyncServerHost ] = useState("");
    const [ password, setPassword ] = useState("");
    const [ syncProxy, setSyncProxy ] = useState("");
    const [ error, setError ] = useState<string | null>(null);
    const [ errorId, setErrorId ] = useState(0);
    const [ isWrongPassword, setIsWrongPassword ] = useState(false);
    const isValid = syncServerHost.trim() !== "" && password !== "";

    function raiseError(message: string) {
        setError(message);
        setErrorId(id => id + 1);
    }

    async function handleFinishSetup() {
        try {
            const resp = await server.post<SetupSyncFromServerResponse>("setup/sync-from-server", {
                syncServerHost: syncServerHost.trim(),
                syncProxy: syncProxy.trim(),
                password
            });

            if (resp.result === "success") {
                setState("syncInProgress");
            } else if (resp.error.includes("Incorrect password")) {
                setIsWrongPassword(true);
            } else {
                raiseError(t("setup.sync-failed", { message: resp.error }));
            }
        } catch (e) {
            raiseError(e instanceof Error ? e.message : String(e));
        }
    }

    return (
        <SetupPage
            className="sync-from-server"
            title={t("setup.sync-from-server")}
            description={t("setup.sync-from-server-page-description")}
            illustration={<SyncIllustration targetDevice="server" />}
            error={error}
            errorId={errorId}
            footer={<>
                <Button text={t("setup.button-back")} onClick={() => setState("firstOptions")} kind="lowProfile" />
                <Button text={t("setup.button-finish-setup")} kind="primary" onClick={handleFinishSetup} disabled={!isValid} />
            </>}
        >
            <form>
                <FormGroup label={t("setup.server-host")} name="serverHost">
                    <FormTextBox placeholder={t("setup.server-host-placeholder")} currentValue={syncServerHost} onChange={setSyncServerHost} required />
                </FormGroup>

                <FormGroup
                    label={t("setup.server-password")} name="serverPassword"
                    error={isWrongPassword ? t("setup.wrong-password") : undefined}
                >
                    <FormTextBox
                        type="password"
                        currentValue={password} onChange={setPassword}
                        required
                    />
                </FormGroup>

                <Collapsible title={t("setup.advanced-options")} initiallyExpanded={false}>
                    <FormGroup
                        name="proxyServer"
                        label={t("setup.proxy-server")}
                        description={isElectron() ? t("setup.proxy-instruction") : undefined}
                    >
                        <FormTextBox placeholder={t("setup.proxy-server-placeholder")} currentValue={syncProxy} onChange={setSyncProxy} />
                    </FormGroup>
                </Collapsible>
            </form>
        </SetupPage>
    );
}

function SyncFromDesktop({ setState }: { setState: (state: State) => void }) {
    function handleFinishSetup() {
    }

    return (
        <SetupPage
            className="sync-from-desktop"
            title={t("setup.sync-from-desktop")}
            illustration={<SyncIllustration targetDevice="desktop" />}
            footer={<>
                <Button text={t("setup.button-back")} onClick={() => setState("firstOptions")} kind="lowProfile" />
                <Button icon="bx-loader bx-spin" text={t("setup.sync-from-desktop-waiting")} kind="primary" disabled />
            </>}
        >
            <Card heading="On the other device">
                <CardSection>1. {t("setup.sync-from-desktop-step1")}</CardSection>
                <CardSection>2. {t("setup.sync-from-desktop-step2")}</CardSection>
                <CardSection>3. {t("setup.sync-from-desktop-step3")}</CardSection>
                <CardSection>4. {t("setup.sync-from-desktop-step4", { host: location.host })}</CardSection>
                <CardSection>5. {t("setup.sync-from-desktop-step5")}</CardSection>

                {t("setup.sync-from-desktop-final")}
            </Card>
        </SetupPage>
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

function SetupOptionCard({ title, description, icon, onClick, disabled }: { title: string; description: string, icon: string, onClick?: () => void, disabled?: boolean }) {
    return (
        <CardFrame
            className={clsx("setup-option-card", { disabled })}
            onClick={disabled ? undefined : onClick}
        >
            <Icon icon={icon} />

            <div>
                <h3>{title}</h3>
                <p>{description}</p>
            </div>
        </CardFrame>
    );
}

function SetupPage({ title, className, illustration, children, footer, error, errorId }: {
    title: string;
    description?: string;
    error?: string | null;
    errorId?: number;
    className?: string;
    illustration?: ComponentChildren;
    children: ComponentChildren;
    footer?: ComponentChildren;
}) {
    const [ showError, setShowError ] = useState(!!error);
    useEffect(() => {
        if (error) {
            setShowError(true);
        }
    }, [ error, errorId ]);

    return (
        <div className={clsx("page", className)}>
            {error && showError && (
                <Admonition className="page-error" type="caution">
                    <ActionButton icon="bx bx-x" text={t("setup.dismiss-error")} onClick={() => setShowError(false)}  />
                    {replaceHtmlEscapedSlashes(error)}
                </Admonition>
            )}

            {illustration}
            <h1>{title}</h1>
            <main>
                {children}
            </main>
            {footer && <footer>{footer}</footer>}
        </div>
    );
}

main();
