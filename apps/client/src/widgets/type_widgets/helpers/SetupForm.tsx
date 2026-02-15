import "./SetupForm.css";

import clsx from "clsx";
import { ComponentChildren } from "preact";

interface SetupFormProps {
    icon: string;
    onSubmit?: () => void;
    children: ComponentChildren;
}

export default function SetupForm({ icon, children, onSubmit }: SetupFormProps) {
    return (
        <div class="setup-form">
            <form class="tn-centered-form" onSubmit={onSubmit}>
                <span className={clsx(icon, "form-icon")} />

                {children}
            </form>
        </div>
    );
}
