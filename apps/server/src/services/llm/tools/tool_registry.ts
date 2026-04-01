/**
 * Lightweight wrapper around AI tool definitions that carries extra metadata
 * (e.g. `mutates`, `needsContext`) while remaining compatible with the Vercel
 * AI SDK ToolSet.
 *
 * Each tool module calls `defineTools({ ... })` to declare its tools.
 * Consumers can then:
 * - iterate over entries with `for (const [name, def] of registry)` (MCP)
 * - convert to an AI SDK ToolSet with `registry.toToolSet()` (LLM chat)
 */

import { tool } from "ai";
import type { z } from "zod";
import type { ToolSet } from "ai";

/** Context passed to tools that declare `needsContext: true`. */
export interface ToolContext {
    contextNoteId: string;
}

interface ToolDefinitionBase {
    description: string;
    inputSchema: z.ZodType;
    /** Whether this tool modifies data (needs CLS + transaction wrapping). */
    mutates?: boolean;
}

/** A tool that does not require a note context. */
export interface StaticToolDefinition extends ToolDefinitionBase {
    needsContext?: false;
    execute: (args: any) => Promise<unknown>;
}

/** A tool that requires a note context (e.g. "current note"). */
export interface ContextToolDefinition extends ToolDefinitionBase {
    needsContext: true;
    execute: (args: any, context: ToolContext) => Promise<unknown>;
}

export type ToolDefinition = StaticToolDefinition | ContextToolDefinition;

/**
 * A named collection of tool definitions that can be iterated or converted
 * to an AI SDK ToolSet.
 */
export class ToolRegistry implements Iterable<[string, ToolDefinition]> {
    constructor(private readonly tools: Record<string, ToolDefinition>) {}

    /** Iterate over `[name, definition]` pairs. */
    [Symbol.iterator](): Iterator<[string, ToolDefinition]> {
        return Object.entries(this.tools)[Symbol.iterator]();
    }

    /**
     * Convert to an AI SDK ToolSet for use with the LLM chat providers.
     *
     * If `context` is provided, context-aware tools are included with the
     * context bound into their execute function. Otherwise they are skipped.
     */
    toToolSet(context?: ToolContext): ToolSet {
        const set: ToolSet = {};
        for (const [name, def] of this) {
            if (def.needsContext) {
                if (!context) continue;
                const boundExecute = (args: any) => def.execute(args, context);
                set[name] = tool({
                    description: def.description,
                    inputSchema: def.inputSchema,
                    execute: boundExecute
                });
            } else {
                set[name] = tool({
                    description: def.description,
                    inputSchema: def.inputSchema,
                    execute: def.execute
                });
            }
        }
        return set;
    }
}

/**
 * Define a group of tools with metadata.
 *
 * ```ts
 * export const noteTools = defineTools({
 *     search_notes: { description: "...", inputSchema: z.object({...}), execute: async (args) => {...} },
 *     get_current_note: { description: "...", inputSchema: z.object({}), execute: async (args, ctx) => {...}, needsContext: true },
 * });
 * ```
 */
export function defineTools(tools: Record<string, ToolDefinition>): ToolRegistry {
    return new ToolRegistry(tools);
}
