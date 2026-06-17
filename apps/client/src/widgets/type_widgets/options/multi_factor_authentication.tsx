import "./multi_factor_authentication.css";

import { OAuthStatus, TOTPEnableResponse, TOTPGenerate, TOTPRecoveryKeysResponse, TOTPStatus, TOTPVerifyResponse } from "@triliumnext/commons";
import { RefObject } from "preact";
import { createPortal } from "preact/compat";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import qrcode from "qrcode-generator";
import { Trans } from "react-i18next";

import dialog from "../../../services/dialog";
import { t } from "../../../services/i18n";
import server from "../../../services/server";
import toast from "../../../services/toast";
import utils, { isElectron } from "../../../services/utils";
import Admonition from "../../react/Admonition";
import { Badge } from "../../react/Badge";
import Button from "../../react/Button";
import FormCheckbox from "../../react/FormCheckbox";
import FormGroup from "../../react/FormGroup";
import { FormInlineRadioGroup } from "../../react/FormRadioGroup";
import FormText from "../../react/FormText";
import FormTextBox from "../../react/FormTextBox";
import { useTriliumOption } from "../../react/hooks";
import Modal from "../../react/Modal";
import RawHtml, { RawHtmlBlock } from "../../react/RawHtml";
import OptionsPageHeader from "./components/OptionsPageHeader";
import { OptionsRowWithButton } from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";

export default function MultiFactorAuthenticationSettings() {
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

    // MFA is active when the selected method is fully set up: a TOTP secret has been enrolled, or
    // OAuth has all its server-side environment variables (no missing vars). There's no separate
    // enable switch — enrolling a method is what turns it on, and removing it is what turns it off.
    const oauthConfigured = (oauthStatus?.missingVars?.length ?? 1) === 0;
    const mfaActive = (mfaMethod === "totp" && !!totpStatus?.set)
        || (mfaMethod === "oauth" && oauthConfigured);

    return (!isElectron()
        ? (
            <>
                <OptionsPageHeader actions={<MfaStatusBadge active={mfaActive} />} />
                <MultiFactorMethod
                    mfaMethod={mfaMethod} setMfaMethod={setMfaMethod}
                    totpStatus={totpStatus} oauthStatus={oauthStatus}
                    refreshTotpStatus={refreshTotpStatus}
                />
            </>
        ) : (
            <>
                <OptionsPageHeader />
                <FormText>{t("multi_factor_authentication.electron_disabled")}</FormText>
            </>
        )
    );
}

function MfaStatusBadge({ active }: { active: boolean }) {
    return (
        <div className="mfa-header-actions">
            <Badge
                className={`mfa-status-badge ${active ? "active" : "inactive"}`}
                icon={active ? "bx bx-check-shield" : "bx bx-shield-x"}
                text={active ? t("multi_factor_authentication.status_active") : t("multi_factor_authentication.status_inactive")}
                tooltip={active ? t("multi_factor_authentication.status_active_tooltip") : t("multi_factor_authentication.status_inactive_tooltip")}
                outline
            />
        </div>
    );
}

function MultiFactorMethod({ mfaMethod, setMfaMethod, totpStatus, oauthStatus, refreshTotpStatus }: {
    mfaMethod: string,
    setMfaMethod: (newValue: string) => Promise<void>,
    totpStatus?: TOTPStatus,
    oauthStatus?: OAuthStatus,
    refreshTotpStatus: () => void
}) {
    // The method selector only matters during initial setup. Switching method once one is configured
    // silently strands the existing setup and can leave MFA effectively off (see the remove flow),
    // so once the current method is set up we hide the selector — removing TOTP (or reconfiguring
    // OAuth server-side) is the way to change method.
    const methodSetUp = mfaMethod === "totp" ? totpStatus?.set : oauthStatus?.enabled;

    return (
        <>
            <FormText><Trans i18nKey="multi_factor_authentication.description" /></FormText>

            {!methodSetUp &&
                <OptionsSection className="mfa-options" title={t("multi_factor_authentication.mfa_method")}>
                    <FormInlineRadioGroup
                        name="mfaMethod"
                        currentValue={mfaMethod} onChange={setMfaMethod}
                        values={[
                            { value: "totp", label: t("multi_factor_authentication.totp_title") },
                            { value: "oauth", label: t("multi_factor_authentication.oauth_title") }
                        ]}
                    />

                    <FormText>
                        { mfaMethod === "totp"
                            ? t("multi_factor_authentication.totp_description")
                            : <RawHtml html={t("multi_factor_authentication.oauth_description")} /> }
                    </FormText>
                </OptionsSection>}

            { mfaMethod === "totp"
                ? <TotpSettings totpStatus={totpStatus} refreshTotpStatus={refreshTotpStatus} />
                : <OAuthSettings status={oauthStatus} /> }
        </>
    );
}

function TotpSettings({ totpStatus, refreshTotpStatus }: {
    totpStatus?: TOTPStatus,
    refreshTotpStatus: () => void
}) {
    // The per-code used/unused status loaded from the server (one entry per code). `undefined` means
    // no recovery codes have been set up yet.
    const [ recoveryStatus, setRecoveryStatus ] = useState<string[]>();
    // The plaintext codes from a generation done in this session, shown once so the user can save
    // them. Cleared on unmount — they can never be retrieved again, only replaced.
    const [ generatedKeys, setGeneratedKeys ] = useState<string[]>();
    // Whether the verify-before-enable enrollment modal is open.
    const [ showEnroll, setShowEnroll ] = useState(false);

    const refreshRecoveryKeys = useCallback(async () => {
        const result = await server.get<TOTPRecoveryKeysResponse>("totp_recovery/enabled");

        if (!result.success) {
            toast.showError(t("multi_factor_authentication.recovery_keys_error"));
            return;
        }

        if (!result.keysExist) {
            setRecoveryStatus(undefined);
            return;
        }

        const usedResult = await server.get<TOTPRecoveryKeysResponse>("totp_recovery/used");
        setRecoveryStatus(usedResult.usedRecoveryCodes);
    }, []);

    const generateRecoveryKeys = useCallback(async () => {
        const result = await server.get<TOTPRecoveryKeysResponse>("totp_recovery/generate");
        if (!result.success) {
            toast.showError(t("multi_factor_authentication.recovery_keys_error"));
            return;
        }

        if (result.recoveryCodes) {
            setGeneratedKeys(result.recoveryCodes);
        }

        // `totp_recovery/generate` already persisted the codes, so no extra `set` round-trip is needed.
        await refreshRecoveryKeys();
    }, [ refreshRecoveryKeys ]);

    // Runs once enrollment is committed (the modal's Finish step persisted the secret and the recovery
    // codes it already showed), so we only refresh state here — generating again would invalidate the
    // codes the user just saved.
    const onEnrollmentComplete = useCallback(() => {
        toast.showMessage(t("multi_factor_authentication.totp_enroll_enabled"));
        refreshTotpStatus();
        void refreshRecoveryKeys();
    }, [ refreshTotpStatus, refreshRecoveryKeys ]);

    const removeTotp = useCallback(async () => {
        if (!await dialog.confirm(t("multi_factor_authentication.totp_remove_confirm"))) {
            return;
        }

        await server.post("totp/reset");
        toast.showMessage(t("multi_factor_authentication.totp_removed"));
        // The secret and recovery codes are gone server-side; refresh so the section drops back to
        // its "not set up" state (badge inactive, method selector shown) right away.
        refreshTotpStatus();
        refreshRecoveryKeys();
    }, [ refreshTotpStatus, refreshRecoveryKeys ]);

    useEffect(() => {
        // The TOTP secret status is fetched by the parent; here we only load the recovery codes.
        refreshRecoveryKeys();
    }, [ refreshRecoveryKeys ]);

    return (<>
        <OptionsSection title={t("multi_factor_authentication.totp_secret_title")}>
            {totpStatus?.set
                ? <Admonition type="warning">{t("multi_factor_authentication.totp_secret_description_warning")}</Admonition>
                : <Admonition type="note">{t("multi_factor_authentication.no_totp_secret_warning")}</Admonition>
            }

            <Button
                text={totpStatus?.set
                    ? t("multi_factor_authentication.totp_secret_regenerate")
                    : t("multi_factor_authentication.totp_secret_generate")}
                onClick={async () => {
                    if (totpStatus?.set && !await dialog.confirm(t("multi_factor_authentication.totp_secret_regenerate_confirm"))) {
                        return;
                    }

                    // Don't generate-and-persist here. The enrollment modal fetches a secret, has the
                    // user confirm a code for it, and only then is it persisted server-side — so a
                    // botched setup leaves the existing (or no) secret untouched instead of locking
                    // the user out on next login.
                    setShowEnroll(true);
                }}
            />
        </OptionsSection>

        <TotpRecoveryKeys
            status={recoveryStatus}
            generatedKeys={generatedKeys}
            generateRecoveryKeys={generateRecoveryKeys}
            onRemoveTotp={totpStatus?.set ? removeTotp : undefined}
        />

        {createPortal(
            <TotpEnrollmentModal
                show={showEnroll}
                onHidden={() => setShowEnroll(false)}
                onComplete={onEnrollmentComplete}
            />,
            document.body
        )}
    </>);
}

/**
 * Verify-before-enable enrollment dialog with two steps, and crucially nothing is persisted until the
 * user finishes — so dismissing at any point leaves TOTP exactly as it was:
 *
 *  1. Fetch a fresh secret, show it for the user to add to their authenticator, and require a valid
 *     code (`totp/verify`). This proves possession but commits nothing.
 *  2. Show the recovery codes `totp/verify` issued so the user can save the fallback they'll need if
 *     they lose their authenticator. Finishing (`totp/enable`) is the single point that persists the
 *     secret + codes and actually enables TOTP.
 */
function TotpEnrollmentModal({ show, onHidden, onComplete }: {
    show: boolean,
    onHidden: () => void,
    /** Called when TOTP has been committed (enabled), so the surrounding section can refresh. */
    onComplete: () => void
}) {
    const [ secret, setSecret ] = useState<string>();
    // The `otpauth://` URL for the secret, rendered as a scannable QR code alongside the manual secret.
    const [ secretUrl, setSecretUrl ] = useState<string>();
    const [ loadFailed, setLoadFailed ] = useState(false);
    const [ code, setCode ] = useState("");
    const [ codeRejected, setCodeRejected ] = useState(false);
    const [ verifying, setVerifying ] = useState(false);
    // Set once verification succeeds: switches the dialog to the "save your recovery codes" step.
    // Nothing is persisted server-side at this point — the secret and these codes are only committed
    // when the user finishes (see `enable`), so dismissing here leaves TOTP exactly as it was.
    const [ recoveryCodes, setRecoveryCodes ] = useState<string[]>();
    const [ acknowledged, setAcknowledged ] = useState(false);
    const [ enabling, setEnabling ] = useState(false);
    const codeRef = useRef<HTMLInputElement>(null);

    // Each time the modal opens, reset state and request a fresh secret.
    useEffect(() => {
        if (!show) {
            return;
        }

        setSecret(undefined);
        setSecretUrl(undefined);
        setLoadFailed(false);
        setCode("");
        setCodeRejected(false);
        setVerifying(false);
        setRecoveryCodes(undefined);
        setAcknowledged(false);
        setEnabling(false);

        void server.get<TOTPGenerate>("totp/generate").then((result) => {
            if (result.success) {
                setSecret(result.message);
                setSecretUrl(result.url);
            } else {
                setLoadFailed(true);
            }
        });
    }, [ show ]);

    // Focus the code field once the secret has loaded (verify step only).
    useEffect(() => {
        if (secret && !recoveryCodes) {
            codeRef.current?.focus();
        }
    }, [ secret, recoveryCodes ]);

    // Step 1: check the code against the secret. Persists nothing — on success we only advance to the
    // recovery-codes step with the codes the server issued.
    const verify = useCallback(async () => {
        if (!secret || code.length === 0 || verifying) {
            return;
        }

        setVerifying(true);
        setCodeRejected(false);

        const result = await server.post<TOTPVerifyResponse>("totp/verify", { secret, token: code });
        setVerifying(false);

        if (!result.success) {
            setCodeRejected(true);
            setCode("");
            codeRef.current?.focus();
            return;
        }

        setRecoveryCodes(result.recoveryCodes ?? []);
    }, [ secret, code, verifying ]);

    // Step 2 (Finish): the single commit point — persist the secret and recovery codes, enabling TOTP.
    const enable = useCallback(async () => {
        if (!secret || !recoveryCodes || !acknowledged || enabling) {
            return;
        }

        setEnabling(true);
        const result = await server.post<TOTPEnableResponse>("totp/enable", { secret, recoveryCodes });
        setEnabling(false);

        if (!result.success) {
            toast.showError(t("multi_factor_authentication.totp_enroll_enable_error"));
            return;
        }

        onComplete();
        onHidden();
    }, [ secret, recoveryCodes, acknowledged, enabling, onComplete, onHidden ]);

    const inRecoveryStep = !!recoveryCodes;

    return (
        <Modal
            className="totp-enrollment-modal"
            title={inRecoveryStep
                ? t("multi_factor_authentication.totp_enroll_recovery_title")
                : t("multi_factor_authentication.totp_enroll_title")}
            size="md"
            show={show}
            // Dismissing simply closes; nothing was persisted unless the user finished (see `enable`).
            onHidden={onHidden}
            onSubmit={() => {
                if (inRecoveryStep) {
                    void enable();
                } else {
                    void verify();
                }
            }}
            stackable
            footer={inRecoveryStep
                ? <Button
                    text={t("multi_factor_authentication.totp_enroll_finish")}
                    kind="primary"
                    disabled={!acknowledged || enabling}
                    onClick={() => void enable()}
                />
                : <>
                    <Button text={t("multi_factor_authentication.totp_enroll_cancel")} onClick={onHidden} />
                    <Button
                        text={t("multi_factor_authentication.totp_enroll_verify")}
                        kind="primary"
                        disabled={!secret || code.length === 0 || verifying}
                    />
                </>}
        >
            {inRecoveryStep
                ? <TotpRecoveryStep codes={recoveryCodes} acknowledged={acknowledged} setAcknowledged={setAcknowledged} />
                : loadFailed
                    ? <Admonition type="caution">{t("multi_factor_authentication.totp_enroll_generate_error")}</Admonition>
                    : <TotpVerifyStep secret={secret} secretUrl={secretUrl} code={code} setCode={setCode} codeRejected={codeRejected} codeRef={codeRef} />}
        </Modal>
    );
}

/** Step 1: show the generated secret and collect a verification code from the user's authenticator. */
function TotpVerifyStep({ secret, secretUrl, code, setCode, codeRejected, codeRef }: {
    secret?: string,
    secretUrl?: string,
    code: string,
    setCode: (value: string) => void,
    codeRejected: boolean,
    codeRef: RefObject<HTMLInputElement>
}) {
    return (
        <>
            <FormText>{t("multi_factor_authentication.totp_enroll_instructions")}</FormText>

            {secretUrl && <TotpQrCode url={secretUrl} />}

            <FormGroup name="totp-enroll-secret" label={t("multi_factor_authentication.totp_enroll_secret_label")}>
                <FormTextBox
                    className="totp-enroll-secret"
                    currentValue={secret ?? ""}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                />
            </FormGroup>

            <FormGroup
                name="totp-enroll-code"
                label={t("multi_factor_authentication.totp_enroll_code_label")}
                error={codeRejected ? t("multi_factor_authentication.totp_enroll_invalid_code") : undefined}
            >
                <FormTextBox
                    inputRef={codeRef}
                    currentValue={code}
                    onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={t("multi_factor_authentication.totp_enroll_code_placeholder")}
                    maxLength={6}
                />
            </FormGroup>
        </>
    );
}

/**
 * Renders an `otpauth://` URL as an inline SVG QR code for scanning into an authenticator app. The URL
 * is generated from our own secret (not user input), so the SVG is trusted and rendered via RawHtml.
 */
function TotpQrCode({ url }: { url: string }) {
    const svg = useMemo(() => {
        // typeNumber 0 lets the library pick the smallest version that fits; "M" error correction is
        // the authenticator-app standard. cellSize/margin set the viewBox units — actual display size
        // is controlled by CSS via the `scalable` (viewBox-only) output.
        const qr = qrcode(0, "M");
        qr.addData(url);
        qr.make();
        return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    }, [ url ]);

    return (
        <div className="totp-enroll-qr">
            <FormText>{t("multi_factor_authentication.totp_enroll_scan")}</FormText>
            <RawHtmlBlock className="totp-enroll-qr-code" html={svg} />
        </div>
    );
}

/** Step 2: present the issued recovery codes with copy/download and require the user to acknowledge saving them. */
function TotpRecoveryStep({ codes, acknowledged, setAcknowledged }: {
    codes: string[],
    acknowledged: boolean,
    setAcknowledged: (value: boolean) => void
}) {
    return (
        <>
            <FormText>{t("multi_factor_authentication.totp_enroll_recovery_instructions")}</FormText>

            <ol className="totp-recovery-codes">
                {codes.map((recoveryCode) => <li key={recoveryCode}><code>{recoveryCode}</code></li>)}
            </ol>

            <div className="totp-recovery-actions">
                <Button
                    icon="bx-copy"
                    text={t("multi_factor_authentication.totp_enroll_recovery_copy")}
                    onClick={() => {
                        utils.copyHtmlToClipboard(codes.join("\n"));
                        toast.showMessage(t("multi_factor_authentication.totp_enroll_recovery_copied"));
                    }}
                />
                <Button
                    icon="bx-download"
                    text={t("multi_factor_authentication.totp_enroll_recovery_download")}
                    onClick={() => downloadRecoveryCodes(codes)}
                />
            </div>

            <Admonition type="caution">
                <Trans i18nKey="multi_factor_authentication.recovery_keys_description_warning" />
            </Admonition>

            <FormCheckbox
                name="totp-recovery-saved"
                label={t("multi_factor_authentication.totp_enroll_saved_ack")}
                currentValue={acknowledged}
                onChange={setAcknowledged}
            />
        </>
    );
}

/** Downloads the recovery codes as a plain-text file. Uses a Blob so it works over HTTP, unlike the clipboard API. */
function downloadRecoveryCodes(codes: string[]) {
    const blob = new Blob([ `${codes.join("\n")}\n` ], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "trilium-recovery-codes.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function TotpRecoveryKeys({ status, generatedKeys, generateRecoveryKeys, onRemoveTotp }: {
    status?: string[],
    generatedKeys?: string[],
    generateRecoveryKeys: () => Promise<void>,
    /** When set, TOTP is configured and a "remove two-factor authentication" action is shown. */
    onRemoveTotp?: () => void
}) {
    // Freshly generated in this session: show the plaintext codes once so the user can save them.
    if (generatedKeys) {
        return (
            <OptionsSection title={t("multi_factor_authentication.totp_section_title")}>
                <FormText>{t("multi_factor_authentication.recovery_keys_description")}</FormText>

                <Admonition type="caution">
                    <Trans i18nKey="multi_factor_authentication.recovery_keys_description_warning" />
                </Admonition>

                <ol style={{ columnCount: 2 }}>
                    {generatedKeys.map(key => <li key={key}><code>{key}</code></li>)}
                </ol>

                <Button
                    text={t("multi_factor_authentication.recovery_keys_regenerate")}
                    onClick={generateRecoveryKeys}
                />
            </OptionsSection>
        );
    }

    // Already set up: a compact recovery-codes row (a dot per code showing which are spent, the
    // remaining count, and a replace action), followed by the destructive remove-TOTP action.
    if (status) {
        const remaining = status.filter(isUnusedRecoveryCode).length;
        return (
            <OptionsSection title={t("multi_factor_authentication.totp_section_title")}>
                <OptionsRowWithButton
                    label={
                        <span className="recovery-codes-title">
                            {t("multi_factor_authentication.recovery_keys_label")}
                            <RecoveryCodeDots status={status} />
                        </span>
                    }
                    description={t("multi_factor_authentication.recovery_keys_remaining", { remaining, total: status.length })}
                    icon="bx-refresh"
                    buttonText={t("multi_factor_authentication.recovery_keys_generate_new")}
                    onClick={generateRecoveryKeys}
                />

                {onRemoveTotp &&
                    <OptionsRowWithButton
                        label={t("multi_factor_authentication.totp_remove_label")}
                        description={t("multi_factor_authentication.totp_remove_description")}
                        icon="bx-trash"
                        buttonClassName="totp-remove-button"
                        buttonText={t("multi_factor_authentication.totp_remove_button")}
                        onClick={onRemoveTotp}
                    />}
            </OptionsSection>
        );
    }

    // Not set up yet: the original empty state with a generate action.
    return (
        <OptionsSection title={t("multi_factor_authentication.totp_section_title")}>
            <FormText>{t("multi_factor_authentication.recovery_keys_description")}</FormText>

            <p>{t("multi_factor_authentication.recovery_keys_no_key_set")}</p>

            <Button
                text={t("multi_factor_authentication.recovery_keys_generate")}
                onClick={generateRecoveryKeys}
            />
        </OptionsSection>
    );
}

/**
 * A row of dots, one per recovery code in order, showing at a glance which codes are still available
 * (filled) and which have been spent (hollow). Each dot carries a tooltip with its status.
 */
function RecoveryCodeDots({ status }: { status: string[] }) {
    return (
        <div className="recovery-code-dots">
            {status.map((entry, index) => {
                const unused = isUnusedRecoveryCode(entry);
                return (
                    <span
                        key={index}
                        className={`recovery-code-dot ${unused ? "available" : "used"}`}
                        title={unused
                            ? t("multi_factor_authentication.recovery_keys_dot_available")
                            : t("multi_factor_authentication.recovery_keys_dot_used", { date: formatRecoveryCodeUsedDate(entry) })}
                    />
                );
            })}
        </div>
    );
}

/**
 * Whether a recovery-code status entry represents an unused (still usable) code. The server returns
 * a used code as an ISO timestamp of when it was consumed, and an unused one as its plain numeric
 * index, so a purely numeric entry is one that's still available.
 */
function isUnusedRecoveryCode(statusEntry: string) {
    return /^\d+$/.test(statusEntry);
}

/** Formats a used-code timestamp (stored with `/` date separators) into a readable local date. */
function formatRecoveryCodeUsedDate(statusEntry: string) {
    const date = new Date(statusEntry.replace(/\//g, "-"));
    return isNaN(date.getTime()) ? statusEntry : date.toLocaleString();
}

function OAuthSettings({ status }: { status?: OAuthStatus }) {
    return (
        <OptionsSection title={t("multi_factor_authentication.oauth_title")}>
            { status?.enabled ? (
                <div class="col-md-6">
                    <span><b>{t("multi_factor_authentication.oauth_user_account")}</b></span>
                    <span class="user-account-name">{status.name ?? t("multi_factor_authentication.oauth_user_not_logged_in")}</span>

                    <br />
                    <span><b>{t("multi_factor_authentication.oauth_user_email")}</b></span>
                    <span class="user-account-email">{status.email ?? t("multi_factor_authentication.oauth_user_not_logged_in")}</span>
                </div>
            ) : (
                <>
                    <p>{t("multi_factor_authentication.oauth_description_warning")}</p>

                    { status?.missingVars && (
                        <Admonition type="caution">
                            {t("multi_factor_authentication.oauth_missing_vars", {
                                variables: status.missingVars.map(v => `"${v}"`).join(", ")
                            })}
                        </Admonition>
                    )}
                </>
            )}
        </OptionsSection>
    );
}
