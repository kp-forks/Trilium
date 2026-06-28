import "./setup.css";
import "./login.css";

import { LOCALE_IDS } from "@triliumnext/commons";
import { render } from "preact";
import { useRef, useState } from "preact/hooks";

import logo from "./assets/icon-color.svg?url";
import { initLocale, t } from "./services/i18n";
import Button from "./widgets/react/Button";
import { Card, CardSection } from "./widgets/react/Card";
import FormTextBox from "./widgets/react/FormTextBox";
import SetupPage from "./widgets/react/SetupPage";
import OptionsRow, { OptionsRowWithToggle } from "./widgets/type_widgets/options/components/OptionsRow";

async function main() {
    await initLocale((window.glob.currentLocale?.id ?? "en") as LOCALE_IDS);

    const bodyWrapper = document.createElement("div");
    bodyWrapper.classList.add("setup-outer-wrapper");
    // The device/theme body classes are already applied by index.ts (this page is
    // loaded through the regular bootstrap); we only add the setup styling hook.
    document.body.classList.add("setup");
    render(<App />, bodyWrapper);
    document.body.replaceChildren(bodyWrapper);
}

function App() {
    const config = window.glob.login;
    const illustration = <img src={logo} alt="" className="illustration-logo" />;

    const [ error, setError ] = useState<string | null>(ssoErrorMessage(config?.ssoError));
    const [ errorId, setErrorId ] = useState(0);

    function raiseError(message: string) {
        setError(message);
        setErrorId((id) => id + 1);
    }

    if (config?.ssoEnabled) {
        return (
            <div class="setup-container login-container">
                <SetupPage className="login" title={t("login.heading")} illustration={illustration} error={error} errorId={errorId}>
                    <Card>
                        <CardSection className="login-sso">
                            {/* Server route that initiates the OpenID round-trip. */}
                            <a href="/authenticate" class="google-login-btn">
                                {config.ssoIssuerIcon
                                    ? <img src={config.ssoIssuerIcon} alt="" onError={(e) => (e.currentTarget as HTMLImageElement).remove()} />
                                    : null}
                                {t("login.sign_in_with_sso", { ssoIssuerName: config.ssoIssuerName ?? "" })}
                            </a>
                        </CardSection>
                    </Card>
                </SetupPage>
            </div>
        );
    }

    return (
        <div class="setup-container login-container">
            <PasswordLogin
                illustration={illustration}
                totpEnabled={config?.totpEnabled ?? false}
                error={error}
                errorId={errorId}
                onError={raiseError}
            />
        </div>
    );
}

function PasswordLogin({ illustration, totpEnabled, error, errorId, onError }: {
    illustration: preact.ComponentChildren;
    totpEnabled: boolean;
    error: string | null;
    errorId: number;
    onError: (message: string) => void;
}) {
    const passwordRef = useRef<HTMLInputElement>(null);
    const [ password, setPassword ] = useState("");
    const [ totpToken, setTotpToken ] = useState("");
    const [ rememberMe, setRememberMe ] = useState(false);
    const [ submitting, setSubmitting ] = useState(false);

    async function handleSubmit(e: Event) {
        e.preventDefault();
        if (submitting) {
            return;
        }
        setSubmitting(true);
        try {
            const body = new URLSearchParams({ password });
            if (totpEnabled) {
                body.set("totpToken", totpToken);
            }
            if (rememberMe) {
                body.set("rememberMe", "1");
            }

            const resp = await fetch("login", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body
            });

            if (resp.ok) {
                // Session established — navigate to the app.
                window.location.assign(".");
                return;
            }

            const factor = resp.status === 401 ? (await resp.json().catch(() => ({}))).factor : undefined;
            onError(factor === "totp" ? t("login.incorrect-totp") : t("login.incorrect-password"));
        } catch {
            onError(t("login.incorrect-password"));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form onSubmit={(e) => void handleSubmit(e)}>
            <SetupPage
                className="login"
                title={t("login.heading")}
                illustration={illustration}
                error={error}
                errorId={errorId}
                footer={<Button text={t("login.button")} kind="primary" disabled={submitting} />}
            >
                <Card>
                    <CardSection>
                        <OptionsRow name="password" label={t("login.password")} stacked>
                            <FormTextBox
                                inputRef={passwordRef} autoFocus
                                type="password" name="password"
                                currentValue={password} onChange={setPassword}
                                autocomplete="current-password" required
                            />
                        </OptionsRow>

                        {totpEnabled && (
                            <OptionsRow name="totpToken" label={t("login.totp-token")} stacked>
                                <FormTextBox
                                    name="totpToken"
                                    currentValue={totpToken} onChange={setTotpToken}
                                    autocomplete="one-time-code" required
                                />
                            </OptionsRow>
                        )}

                        <OptionsRowWithToggle
                            name="rememberMe"
                            label={t("login.remember-me")}
                            currentValue={rememberMe}
                            onChange={setRememberMe}
                        />
                    </CardSection>
                </Card>
            </SetupPage>
        </form>
    );
}

function ssoErrorMessage(ssoError: string | false | undefined): string | null {
    if (!ssoError) {
        return null;
    }
    return ssoError === "wrong_account" ? t("login.sso-wrong-account") : t("login.sso-not-enrolled");
}

main();
