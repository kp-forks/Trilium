import "./password.css";

import { ChangePasswordResponse, OAuthStatus, TOTPStatus } from "@triliumnext/commons";
import { createPortal } from "preact/compat";
import { useCallback, useEffect, useState } from "preact/hooks";

import dialog from "../../../services/dialog";
import { t } from "../../../services/i18n";
import protected_session_holder from "../../../services/protected_session_holder";
import server from "../../../services/server";
import toast from "../../../services/toast";
import { isElectron } from "../../../services/utils";
import Admonition from "../../react/Admonition";
import { Badge } from "../../react/Badge";
import Button from "../../react/Button";
import Collapsible from "../../react/Collapsible";
import FormGroup from "../../react/FormGroup";
import FormSelect from "../../react/FormSelect";
import FormText from "../../react/FormText";
import FormTextBox from "../../react/FormTextBox";
import { useTriliumOption } from "../../react/hooks";
import Modal from "../../react/Modal";
import RawHtml from "../../react/RawHtml";
import OptionsPageHeader from "./components/OptionsPageHeader";
import OptionsRow, { OptionsRowWithButton } from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";
import TimeSelector from "./components/TimeSelector";
import { TotpSettings } from "./totp";

export default function PasswordSettings() {
    return (
        <>
            <OptionsPageHeader />
            {/* The sign-in method (and its two-factor / OAuth settings) is only available on the server
                build — the desktop app authenticates differently — matching the former MFA page's
                serverOnly scope. */}
            {!isElectron() && <SignInMethod />}
            <ChangePassword />
            <ProtectedSessionTimeout />
        </>
    );
}

function ChangePassword() {
    const [showModal, setShowModal] = useState(false);

    return (
        <OptionsSection title={t("password.heading")}>
            <OptionsRowWithButton
                label={t("password.change_password")}
                description={t("password.change_password_description")}
                buttonText={t("password.change_password_button")}
                onClick={() => setShowModal(true)}
            />

            <OptionsRowWithButton
                label={t("password.reset_password")}
                description={t("password.reset_password_description")}
                buttonText={t("password.reset_password_button")}
                onClick={async () => {
                    if (!await dialog.confirm(t("password.reset_confirmation"))) {
                        return;
                    }

                    await server.post("password/reset?really=yesIReallyWantToResetPasswordAndLoseAccessToMyProtectedNotes");
                    toast.showError(t("password.reset_success_message"));
                }}
            />

            {createPortal(
                <ChangePasswordModal show={showModal} onHidden={() => setShowModal(false)} />,
                document.body
            )}
        </OptionsSection>
    );
}

interface ChangePasswordModalProps {
    show: boolean;
    onHidden: () => void;
}

function ChangePasswordModal({ show, onHidden }: ChangePasswordModalProps) {
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword1, setNewPassword1] = useState("");
    const [newPassword2, setNewPassword2] = useState("");

    const handleSubmit = async () => {
        if (newPassword1 !== newPassword2) {
            toast.showError(t("password.password_mismatch"));
            return;
        }

        const result = await server.post<ChangePasswordResponse>("password/change", {
            current_password: oldPassword,
            new_password: newPassword1
        });

        if (result.success) {
            onHidden();
            setOldPassword("");
            setNewPassword1("");
            setNewPassword2("");
            await dialog.info(t("password.password_changed_success"));

            // password changed so current protected session is invalid and needs to be cleared
            protected_session_holder.resetProtectedSession();
        } else if (result.message) {
            toast.showError(result.message);
        }
    };

    const handleHidden = () => {
        setOldPassword("");
        setNewPassword1("");
        setNewPassword2("");
        onHidden();
    };

    return (
        <Modal
            show={show}
            onHidden={handleHidden}
            onSubmit={handleSubmit}
            title={t("password.change_password_heading")}
            className="change-password-modal"
            size="md"
            stackable
            footer={
                <>
                    <Button text={t("password.cancel")} onClick={handleHidden} />
                    <Button text={t("password.change_password")} kind="primary" />
                </>
            }
        >
            <FormGroup name="old-password" label={t("password.old_password")}>
                <FormTextBox
                    type="password"
                    currentValue={oldPassword}
                    onChange={setOldPassword}
                />
            </FormGroup>

            <FormGroup name="new-password1" label={t("password.new_password")}>
                <FormTextBox
                    type="password"
                    currentValue={newPassword1}
                    onChange={setNewPassword1}
                />
            </FormGroup>

            <FormGroup name="new-password2" label={t("password.new_password_confirmation")}>
                <FormTextBox
                    type="password"
                    currentValue={newPassword2}
                    onChange={setNewPassword2}
                />
            </FormGroup>
        </Modal>
    );
}

function ProtectedSessionTimeout() {
    return (
        <OptionsSection title={t("password.protected_session_timeout")}>
            <OptionsRow
                name="protected-session-timeout"
                label={t("password.protected_session_timeout_label")}
                description={<>{t("password.protected_session_timeout_description")} <a class="tn-link" href="https://triliumnext.github.io/Docs/Wiki/protected-notes.html">{t("password.wiki")}</a> {t("password.for_more_info")}</>}
            >
                <TimeSelector
                    name="protected-session-timeout"
                    optionValueId="protectedSessionTimeout"
                    optionTimeScaleId="protectedSessionTimeoutTimeScale"
                    minimumSeconds={60}
                />
            </OptionsRow>
        </OptionsSection>
    );
}

/**
 * Two-factor authentication settings. Owns the live TOTP/OAuth status (the method selector needs
 * `totpStatus.set` to know whether to offer switching methods) and delegates the heavier TOTP UI to
 * its own module; OAuth is small and read-only, so it lives here.
 */
function SignInMethod() {
    // `mfaMethod` is the persisted choice: "oauth" means sign in via an OAuth provider, anything else
    // ("totp") means the local password (with TOTP as optional second factor). The dropdown speaks in
    // the user-facing "local"/"oauth" terms and maps back to the option here.
    const [ mfaMethod, setMfaMethod ] = useTriliumOption("mfaMethod");
    const [ totpStatus, setTotpStatus ] = useState<TOTPStatus>();
    const [ oauthStatus, setOauthStatus ] = useState<OAuthStatus>();

    const refreshTotpStatus = useCallback(() => {
        server.get<TOTPStatus>("totp/status").then(setTotpStatus);
    }, []);

    useEffect(() => {
        refreshTotpStatus();
        server.get<OAuthStatus>("oauth/status").then(setOauthStatus);
    }, [ refreshTotpStatus ]);

    const usingOAuth = mfaMethod === "oauth";

    return (
        <>
            <OptionsSection className="signin-method" title={t("multi_factor_authentication.authentication_title")}>
                <OptionsRow name="signin-method" label={t("multi_factor_authentication.signin_method")}>
                    <FormSelect
                        values={[
                            { value: "local", label: t("multi_factor_authentication.signin_local") },
                            { value: "oauth", label: t("multi_factor_authentication.signin_oauth") }
                        ]}
                        keyProperty="value" titleProperty="label"
                        currentValue={usingOAuth ? "oauth" : "local"}
                        onChange={(value) => setMfaMethod(value === "oauth" ? "oauth" : "totp")}
                    />
                </OptionsRow>

                <FormText>
                    { usingOAuth
                        ? <RawHtml html={t("multi_factor_authentication.oauth_description")} />
                        : t("multi_factor_authentication.signin_local_description") }
                </FormText>
            </OptionsSection>

            { usingOAuth
                ? <OAuthStatusCard status={oauthStatus} />
                : <TotpSettings totpStatus={totpStatus} refreshTotpStatus={refreshTotpStatus} /> }
        </>
    );
}

/**
 * Read-only OAuth status card, shown when OAuth is the selected sign-in method. OAuth is configured
 * entirely server-side (env vars / config.ini), so this card offers no controls — it just reflects
 * whether OAuth is available and, once signed in, the connected account.
 */
function OAuthStatusCard({ status }: { status?: OAuthStatus }) {
    // "Configured" is purely about the server-side variables being present (the server's `enabled` flag
    // additionally requires mfaMethod === 'oauth', which is implied here since this card only renders then).
    const configured = (status?.missingVars?.length ?? 1) === 0;

    return (
        <OptionsSection
            title={
                <span className="oauth-status-title">
                    {t("multi_factor_authentication.oauth_title")}
                    <Badge
                        className={`oauth-status-badge ${configured ? "configured" : "not-configured"}`}
                        icon={configured ? "bx bx-check" : "bx bx-x"}
                        text={configured
                            ? t("multi_factor_authentication.oauth_status_configured")
                            : t("multi_factor_authentication.oauth_status_not_configured")}
                        outline
                    />
                </span>
            }
        >
            { configured ? (
                <div class="col-md-6">
                    <span><b>{t("multi_factor_authentication.oauth_user_account")}</b></span>
                    <span class="user-account-name">{status?.name ?? t("multi_factor_authentication.oauth_user_not_logged_in")}</span>

                    <br />
                    <span><b>{t("multi_factor_authentication.oauth_user_email")}</b></span>
                    <span class="user-account-email">{status?.email ?? t("multi_factor_authentication.oauth_user_not_logged_in")}</span>
                </div>
            ) : (
                <>
                    <p>{t("multi_factor_authentication.oauth_not_configured_hint")}</p>

                    { status?.missingVars && status.missingVars.length > 0 && (
                        <Admonition type="note">
                            {t("multi_factor_authentication.oauth_missing_vars", {
                                variables: status.missingVars.map(v => `"${v}"`).join(", ")
                            })}
                        </Admonition>
                    )}

                    <OAuthConfigHint />
                </>
            )}
        </OptionsSection>
    );
}

/**
 * Collapsible "How to enable" hint for OAuth, mirroring the security page's ServerConfigHint. Lists
 * the config.ini section and the equivalent environment variables the server reads — OAuth has no
 * in-app setup, so this is the only place the values are documented in the UI.
 */
function OAuthConfigHint() {
    // oauthBaseUrl is the app's externally-reachable base URL, which for the user reading this is
    // exactly the origin they're browsing from — so prefill it as a sensible example value.
    const baseUrl = window.location.origin;
    return (
        <Collapsible title={t("multi_factor_authentication.oauth_how_to_enable")}>
            <p>{t("multi_factor_authentication.oauth_server_config_hint")}</p>
            <pre><code>{`[MultiFactorAuthentication]\noauthBaseUrl=${baseUrl}\noauthClientId=\noauthClientSecret=`}</code></pre>
            <p>{t("multi_factor_authentication.oauth_server_env_hint")}</p>
            <pre><code>{`TRILIUM_OAUTH_BASE_URL=${baseUrl}\nTRILIUM_OAUTH_CLIENT_ID=\nTRILIUM_OAUTH_CLIENT_SECRET=`}</code></pre>
        </Collapsible>
    );
}
