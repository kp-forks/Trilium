import { ComponentChildren } from "preact";

interface SectionProps {
    title?: string;
    subtitle?: string;
    children: ComponentChildren;
    className?: string;
}

export default function Section({ className, title, subtitle, children }: SectionProps) {
    return (
        <section className={className}>
            <div className="content-wrapper">
                {title && <h2>{title}</h2>}
                {subtitle && <p className="section-subtitle">{subtitle}</p>}
                {children}
            </div>
        </section>
    )
}
