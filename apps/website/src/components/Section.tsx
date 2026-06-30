import { ComponentChildren } from "preact";

import Button from "./Button.js";

interface SectionProps {
    title?: string;
    subtitle?: string;
    cta?: { text: string; href: string };
    children: ComponentChildren;
    className?: string;
}

export default function Section({ className, title, subtitle, cta, children }: SectionProps) {
    return (
        <section className={className}>
            <div className="content-wrapper">
                {title && <h2>{title}</h2>}
                {subtitle && <p className="section-subtitle">{subtitle}</p>}
                {children}
                {cta && (
                    <div className="section-cta">
                        <Button outline text={cta.text} href={cta.href} openExternally />
                    </div>
                )}
            </div>
        </section>
    )
}
