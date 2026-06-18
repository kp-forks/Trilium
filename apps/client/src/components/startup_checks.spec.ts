import { afterEach, describe, expect, it, vi } from "vitest";

import toast from "../services/toast";

import { showOAuthEnrollmentResultToast } from "./startup_checks";

vi.mock("../services/toast", () => ({ default: { showMessage: vi.fn() } }));
vi.mock("../services/i18n", () => ({ t: (key: string) => key }));

const showMessage = vi.mocked(toast.showMessage);

function setGlob(glob: Record<string, unknown> | undefined) {
    (window as unknown as { glob?: unknown }).glob = glob;
}

describe("showOAuthEnrollmentResultToast", () => {
    afterEach(() => {
        vi.clearAllMocks();
        setGlob(undefined);
    });

    it("toasts when the bootstrap reports a fresh enrollment", () => {
        setGlob({ oauthJustEnrolled: true });
        showOAuthEnrollmentResultToast();
        expect(showMessage).toHaveBeenCalledWith("multi_factor_authentication.oauth_connect_success");
    });

    it("stays silent when the flag is absent or false", () => {
        setGlob({ oauthJustEnrolled: false });
        showOAuthEnrollmentResultToast();

        setGlob({});
        showOAuthEnrollmentResultToast();

        setGlob(undefined);
        showOAuthEnrollmentResultToast();

        expect(showMessage).not.toHaveBeenCalled();
    });
});
