import { t } from "../services/i18n";
import server from "../services/server";
import toast from "../services/toast";
import Component from "./component";

// TODO: Deduplicate.
interface CpuArchResponse {
    isCpuArchMismatch: boolean;
}

export class StartupChecks extends Component {

    constructor() {
        super();
        this.checkCpuArchMismatch();
        // Shared by desktop and mobile (both reach here via appContext.start), so the post-enrollment
        // toast lives here rather than being duplicated in each entry point.
        showOAuthEnrollmentResultToast();
    }

    async checkCpuArchMismatch() {
        try {
            const response = await server.get("system-checks") as CpuArchResponse;
            if (response.isCpuArchMismatch) {
                this.triggerCommand("showCpuArchWarning", {});
            }
        } catch (error) {
            console.warn("Could not check CPU arch status:", error);
        }
    }
}

/**
 * Shows a one-shot "account connected" toast after the OAuth provider round-trip redirects back to the
 * app root (which drops the Settings modal). The signal rides in the server's bootstrap payload
 * (`window.glob.oauthJustEnrolled`, set once by the OIDC afterCallback and cleared by /bootstrap), so
 * nothing has to be stored on the client across the redirect.
 */
export function showOAuthEnrollmentResultToast() {
    if (window.glob?.oauthJustEnrolled) {
        toast.showMessage(t("multi_factor_authentication.oauth_connect_success"));
    }
}
