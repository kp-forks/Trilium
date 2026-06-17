import "./multi_factor_authentication.css";

import { OAuthStatus, TOTPGenerate, TOTPRecoveryKeysResponse, TOTPStatus } from "@triliumnext/commons";
import { useCallback, useEffect, useState } from "preact/hooks";
import { Trans } from "react-i18next";

import dialog from "../../../services/dialog";
import { t } from "../../../services/i18n";
import server from "../../../services/server";
import toast from "../../../services/toast";
import { isElectron } from "../../../services/utils";
import Admonition from "../../react/Admonition";
import { Badge } from "../../react/Badge";
import Button from "../../react/Button";
import FormCheckbox from "../../react/FormCheckbox";
import { FormInlineRadioGroup } from "../../react/FormRadioGroup";
import FormText from "../../react/FormText";
import { useTriliumOption, useTriliumOptionBool } from "../../react/hooks";
import RawHtml from "../../react/RawHtml";
import OptionsPageHeader from "./components/OptionsPageHeader";
import { OptionsRowWithButton } from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";

export default function MultiFactorAuthenticationSettings() {
    const [ mfaEnabled, setMfaEnabled ] = useTriliumOptionBool("mfaEnabled");

    return (!isElectron()
        ? (
            <>
                <OptionsPageHeader actions={<MfaStatusBadge mfaEnabled={mfaEnabled} />} />
                <EnableMultiFactor mfaEnabled={mfaEnabled} setMfaEnabled={setMfaEnabled} />
                { mfaEnabled && <MultiFactorMethod /> }
            </>
        ) : (
            <>
                <OptionsPageHeader />
                <FormText>{t("multi_factor_authentication.electron_disabled")}</FormText>
            </>
        )
    );
}

function MfaStatusBadge({ mfaEnabled }: { mfaEnabled: boolean }) {
    return (
        <div className="mfa-header-actions">
            <Badge
                className={`mfa-status-badge ${mfaEnabled ? "active" : "inactive"}`}
                icon={mfaEnabled ? "bx bx-check-shield" : "bx bx-shield-x"}
                text={mfaEnabled ? t("multi_factor_authentication.status_active") : t("multi_factor_authentication.status_inactive")}
                tooltip={mfaEnabled ? t("multi_factor_authentication.status_active_tooltip") : t("multi_factor_authentication.status_inactive_tooltip")}
                outline
            />
        </div>
    );
}

function EnableMultiFactor({ mfaEnabled, setMfaEnabled }: { mfaEnabled: boolean, setMfaEnabled: (newValue: boolean) => Promise<void>}) {
    return (
        <OptionsSection title={t("multi_factor_authentication.title")}>
            <FormText><Trans i18nKey="multi_factor_authentication.description" /></FormText>

            <FormCheckbox
                name="mfa-enabled"
                label={t("multi_factor_authentication.mfa_enabled")}
                currentValue={mfaEnabled} onChange={setMfaEnabled}
            />
        </OptionsSection>
    );
}

function MultiFactorMethod() {
    const [ mfaMethod, setMfaMethod ] = useTriliumOption("mfaMethod");

    return (
        <>
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
            </OptionsSection>

            { mfaMethod === "totp"
                ? <TotpSettings />
                : <OAuthSettings /> }
        </>
    );
}

function TotpSettings() {
    const [ totpStatus, setTotpStatus ] = useState<TOTPStatus>();
    // The per-code used/unused status loaded from the server (one entry per code). `undefined` means
    // no recovery codes have been set up yet.
    const [ recoveryStatus, setRecoveryStatus ] = useState<string[]>();
    // The plaintext codes from a generation done in this session, shown once so the user can save
    // them. Cleared on unmount — they can never be retrieved again, only replaced.
    const [ generatedKeys, setGeneratedKeys ] = useState<string[]>();

    const refreshTotpStatus = useCallback(() => {
        server.get<TOTPStatus>("totp/status").then(setTotpStatus);
    }, []);

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

        await server.post("totp_recovery/set", {
            recoveryCodes: result.recoveryCodes,
        });
        await refreshRecoveryKeys();
    }, [ refreshRecoveryKeys ]);

    useEffect(() => {
        refreshTotpStatus();
        refreshRecoveryKeys();
    }, []);

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

                    const result = await server.get<TOTPGenerate>("totp/generate");
                    if (!result.success) {
                        toast.showError(result.message);
                        return;
                    }

                    await dialog.prompt({
                        title: t("multi_factor_authentication.totp_secret_generated"),
                        message: t("multi_factor_authentication.totp_secret_warning"),
                        defaultValue: result.message,
                        readOnly: true
                    });
                    refreshTotpStatus();
                    await generateRecoveryKeys();
                }}
            />
        </OptionsSection>

        <TotpRecoveryKeys status={recoveryStatus} generatedKeys={generatedKeys} generateRecoveryKeys={generateRecoveryKeys} />
    </>);
}

function TotpRecoveryKeys({ status, generatedKeys, generateRecoveryKeys }: {
    status?: string[],
    generatedKeys?: string[],
    generateRecoveryKeys: () => Promise<void>
}) {
    // Freshly generated in this session: show the plaintext codes once so the user can save them.
    if (generatedKeys) {
        return (
            <OptionsSection title={t("multi_factor_authentication.recovery_keys_title")}>
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

    // Already set up: a single compact row whose label carries a dot per code (showing which are
    // spent), with the remaining count as the description and a replace action on the right.
    if (status) {
        const remaining = status.filter(isUnusedRecoveryCode).length;
        return (
            <OptionsSection title={t("multi_factor_authentication.recovery_keys_title")}>
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
            </OptionsSection>
        );
    }

    // Not set up yet: the original empty state with a generate action.
    return (
        <OptionsSection title={t("multi_factor_authentication.recovery_keys_title")}>
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

function OAuthSettings() {
    const [ status, setStatus ] = useState<OAuthStatus>();

    useEffect(() => {
        server.get<OAuthStatus>("oauth/status").then(setStatus);
    }, []);

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
