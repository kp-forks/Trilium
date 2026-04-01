/**
 * Lightweight wrapper around AI tool definitions that carries extra metadata
 * (e.g. `mutates`) while remaining compatible with the Vercel AI SDK ToolSet.
 *
 * Each tool module calls `defineTools({ ... })` to declare its tools.
 * Consumers can then:
 * - iterate over entries with `for (const [name, def] of registry)` (MCP)
 * - convert to an AI SDK ToolSet with `registry.toToolSet()` (LLM chat)
 */

import { tool } from "ai";
import type { z } from "zod";
import type { ToolSet } from "ai";

export interface ToolDefinition {
    description: string;
    inputSchema: z.ZodType;
    execute: (args: any) => Promise<unknown>;
    /** Whether this tool modifies data (needs CLS + transaction wrapping). */
    mutates?: boolean;
}

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

    /** Convert to an AI SDK ToolSet for use with the LLM chat providers. */
    toToolSet(): ToolSet {
        const set: ToolSet = {};
        for (const [name, def] of this) {
            set[name] = tool({
                description: def.description,
                inputSchema: def.inputSchema,
                execute: def.execute
            });
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
 *     create_note:  { description: "...", inputSchema: z.object({...}), execute: async (args) => {...}, mutates: true },
 * });
 * ```
 */
export function defineTools(tools: Record<string, ToolDefinition>): ToolRegistry {
    return new ToolRegistry(tools);
}
