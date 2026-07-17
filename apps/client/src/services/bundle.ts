import { ScriptParams } from "@triliumnext/commons";
import { h, VNode } from "preact";

import FNote from "../entities/fnote.js";
import BasicWidget, { ReactWrappedWidget } from "../widgets/basic_widget.js";
import RightPanelWidget from "../widgets/right_panel_widget.js";
import type { Entity } from "./frontend_script_api.js";
import { WidgetDefinitionWithType } from "./frontend_script_api_preact.js";
import { t } from "./i18n.js";
import ScriptContext from "./script_context.js";
import server from "./server.js";
import toastService, { showErrorForScriptNote } from "./toast.js";
import utils, { getErrorMessage } from "./utils.js";

// TODO: Deduplicate with server.
export interface Bundle {
    script: string;
    html: string;
    noteId: string;
    allNoteIds: string[];
}

type LegacyWidget = (BasicWidget | RightPanelWidget) & {
    parentWidget?: string;
};
type WithNoteId<T> = T & {
    _noteId: string;
};
export type Widget = WithNoteId<(LegacyWidget | WidgetDefinitionWithType)>;

async function getAndExecuteBundle(noteId: string, originEntity: FNote | null = null, script: string | null = null, params: ScriptParams | null = null) {
    const bundle = await server.post<Bundle>(`script/bundle/${noteId}`, {
        script,
        params
    });

    return await executeBundle(bundle, originEntity);
}

export type ParentName = WidgetDefinitionWithType["parent"];

export async function executeBundleWithoutErrorHandling(bundle: Bundle, originEntity?: Entity | null, $container?: JQuery<HTMLElement>) {
    const apiContext = await ScriptContext(bundle.noteId, bundle.allNoteIds, originEntity, $container);
    return await function () {
        return eval(`const apiContext = this; (async function() { ${bundle.script}\r\n})()`);
    }.call(apiContext);
}

export async function executeBundle(bundle: Bundle, originEntity?: Entity | null, $container?: JQuery<HTMLElement>) {
    try {
        return await executeBundleWithoutErrorHandling(bundle, originEntity, $container);
    } catch (e: unknown) {
        showErrorForScriptNote(bundle.noteId, rootCauseMessage(e), { monospace: true });
        logError("Widget initialization failed: ", e);
    }
}

async function executeStartupBundles() {
    const isMobile = utils.isMobile();
    const scriptBundles = await server.get<Bundle[]>(`script/startup${  isMobile ? "?mobile=true" : ""}`);

    for (const bundle of scriptBundles) {
        await executeBundle(bundle);
    }
}

export class WidgetsByParent {
    private legacyWidgets: Record<string, WithNoteId<LegacyWidget>[]>;
    private preactWidgets: Record<string, WithNoteId<WidgetDefinitionWithType>[]>;

    constructor() {
        this.legacyWidgets = {};
        this.preactWidgets = {};
    }

    add(widget: Widget) {
        let hasParentWidget = false;
        let isPreact = false;
        if ("type" in widget && widget.type === "preact-widget") {
            // React-based script.
            const reactWidget = widget as WithNoteId<WidgetDefinitionWithType>;
            this.preactWidgets[reactWidget.parent] = this.preactWidgets[reactWidget.parent] || [];
            this.preactWidgets[reactWidget.parent].push(reactWidget);
            isPreact = true;
            hasParentWidget = !!reactWidget.parent;
        } else if ("parentWidget" in widget && widget.parentWidget) {
            this.legacyWidgets[widget.parentWidget] = this.legacyWidgets[widget.parentWidget] || [];
            this.legacyWidgets[widget.parentWidget].push(widget);
            hasParentWidget = !!widget.parentWidget;
        }

        if (!hasParentWidget) {
            showErrorForScriptNote(widget._noteId, t("toast.widget-missing-parent", {
                property: isPreact ? "parent" : "parentWidget"
            }));
        }
    }

    get(parentName: ParentName) {
        const widgets: (BasicWidget | VNode)[] = this.getLegacyWidgets(parentName);
        for (const preactWidget of this.getPreactWidgets(parentName)) {
            const el = h(preactWidget.render, {});
            const widget = new ReactWrappedWidget(el);
            widget.contentSized();
            if (preactWidget.position) {
                widget.position = preactWidget.position;
            }
            widgets.push(widget);
        }

        return widgets;
    }

    getLegacyWidgets(parentName: ParentName): (BasicWidget | RightPanelWidget)[] {
        if (!this.legacyWidgets[parentName]) return [];

        return (
            this.legacyWidgets[parentName]
                // previously, custom widgets were provided as a single instance, but that has the disadvantage
                // for splits where we actually need multiple instaces and thus having a class to instantiate is better
                // https://github.com/zadam/trilium/issues/4274
                .map((w: any) => (w.prototype ? new w() : w))
        );
    }

    getPreactWidgets(parentName: ParentName) {
        return this.preactWidgets[parentName] ?? [];
    }
}

async function getWidgetBundlesByParent() {
    const widgetsByParent = new WidgetsByParent();

    try {
        const scriptBundles = await server.get<Bundle[]>("script/widgets");

        for (const bundle of scriptBundles) {
            let widget;

            try {
                widget = await executeBundle(bundle);
                if (widget) {
                    widget._noteId = bundle.noteId;
                    widgetsByParent.add(widget);
                }
            } catch (e: any) {
                const noteId = bundle.noteId;
                showErrorForScriptNote(noteId, rootCauseMessage(e), { monospace: true });

                logError("Widget initialization failed: ", e);
                continue;
            }
        }
    } catch (e) {
        toastService.showPersistent({
            id: `custom-widget-list-failure`,
            title: t("toast.widget-list-error.title"),
            message: getErrorMessage(e),
            icon: "bx bx-error-circle"
        });
    }

    return widgetsByParent;
}

export default {
    executeBundle,
    getAndExecuteBundle,
    executeStartupBundles,
    getWidgetBundlesByParent
};

/**
 * The script bundler wraps each script note's thrown errors as
 * `Load of script note "<title>" (<noteId>) failed with: <inner>` and attaches the original error
 * as the `cause` (see the bundle template in trilium-core's `script.ts`). That prefix is useful in
 * backend logs but redundant in the UI, where the failing note is already shown as a reference link,
 * so we surface the underlying error instead — walking the `cause` chain to the bottom also unwraps
 * the nested errors produced when a `require()`d module fails.
 */
function rootCauseMessage(e: unknown): string {
    let error = e;
    while (error instanceof Error && error.cause !== undefined) {
        error = error.cause;
    }
    return error instanceof Error ? error.message : String(error);
}
