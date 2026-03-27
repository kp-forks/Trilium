import becca from "../../becca/becca";

import { RenderMarkdownResponse, ToMarkdownResponse } from "@triliumnext/commons";
import type { Request } from "express";

import markdown from "../../services/export/markdown.js";
import { markdownImportService } from "../..";

function renderMarkdown(req: Request) {
    const { markdownContent } = req.body;
    if (!markdownContent || typeof markdownContent !== 'string') {
        throw new Error('markdownContent parameter is required and must be a string');
    }
    return {
        htmlContent: markdownImportService.renderToHtml(markdownContent, "")
    } satisfies RenderMarkdownResponse;
}

function toMarkdown(req: Request) {
    const { htmlContent } = req.body;
    if (!htmlContent || typeof htmlContent !== 'string') {
        throw new Error('htmlContent parameter is required and must be a string');
    }
    return {
        markdownContent: markdown.toMarkdown(htmlContent)
    } satisfies ToMarkdownResponse;
}

function getIconUsage() {
    const iconClassToCountMap: Record<string, number> = {};

    for (const { value: iconClass, noteId } of becca.findAttributes("label", "iconClass")) {
        if (noteId.startsWith("_")) {
            continue; // ignore icons of "system" notes since they were not set by the user
        }

        if (!iconClass?.trim()) {
            continue;
        }

        for (const clazz of iconClass.trim().split(/\s+/)) {
            if (clazz === "bx") {
                continue;
            }

            iconClassToCountMap[clazz] = (iconClassToCountMap[clazz] || 0) + 1;
        }
    }

    return { iconClassToCountMap };
}

export default {
    getIconUsage,
    renderMarkdown,
    toMarkdown
}
