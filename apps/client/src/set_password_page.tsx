import "./setup.css";
import "./set_password.css";

import { LOCALE_IDS } from "@triliumnext/commons";
import { render } from "preact";
import { useRef, useState } from "preact/hooks";

import { initLocale, t } from "./services/i18n";
import Button from "./widgets/react/Button";
import { Card, CardSection } from "./widgets/react/Card";
import FormGroup from "./widgets/react/FormGroup";
import FormTextBox from "./widgets/react/FormTextBox";
import Icon from "./widgets/react/Icon";
import SetupPage from "./widgets/react/SetupPage";

const MIN_PASSWORD_LENGTH = 4;

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
    const password1Ref = useRef<HTMLInputElement>(null);
    const [ password1, setPassword1 ] = useState("");
    const [ password2, setPassword2 ] = useState("");

    // Mirror the server-side validation so the form can't be submitted into an error.
    const tooShort = password1 !== "" && password1.length < MIN_PASSWORD_LENGTH;
    const mismatch = password2 !== "" && password1 !== password2;
    const isValid = password1.length >= MIN_PASSWORD_LENGTH && password1 === password2;

    return (
        <div class="setup-container set-password-container">
            {/* On success the server sets the password and redirects to the login page. */}
            <form method="POST" action="set-password" onSubmit={(e) => { if (!isValid) e.preventDefault(); }}>
                <SetupPage
                    className="set-password"
                    title={t("set_password.heading")}
                    description={t("set_password.description")}
                    illustration={<Icon icon="bx bx-lock-alt" className="illustration-icon" />}
                    footer={<Button text={t("set_password.button")} kind="primary" disabled={!isValid} />}
                >
                    <Card>
                        <CardSection>
                            <FormGroup
                                label={t("set_password.password")} name="password1"
                                error={tooShort ? t("set_password.password-too-short", { length: MIN_PASSWORD_LENGTH }) : undefined}
                            >
                                <FormTextBox
                                    inputRef={password1Ref} autoFocus
                                    type="password" name="password1"
                                    currentValue={password1} onChange={setPassword1}
                                    autocomplete="new-password" required
                                />
                            </FormGroup>
                        </CardSection>

                        <CardSection>
                            <FormGroup
                                label={t("set_password.password-confirmation")} name="password2"
                                error={mismatch ? t("set_password.passwords-dont-match") : undefined}
                            >
                                <FormTextBox
                                    type="password" name="password2"
                                    currentValue={password2} onChange={setPassword2}
                                    autocomplete="new-password" required
                                />
                            </FormGroup>
                        </CardSection>
                    </Card>
                </SetupPage>
            </form>
        </div>
    );
}

main();
