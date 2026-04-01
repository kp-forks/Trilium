/**
 * MCP (Model Context Protocol) server for Trilium Notes.
 *
 * Exposes existing LLM tools via the MCP protocol so external AI agents
 * (e.g. Claude Desktop) can interact with Trilium.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import appInfo from "../app_info.js";
import cls from "../cls.js";
import sql from "../sql.js";
import { allToolRegistries } from "../llm/tools/index.js";

import type { ToolDefinition } from "../llm/tools/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Register a tool definition on the MCP server.
 *
 * Write operations are wrapped in CLS + transaction context so that
 * Becca entity tracking works correctly.
 */
function registerTool(server: McpServer, name: string, def: ToolDefinition) {
    server.registerTool(name, {
        description: def.description,
        inputSchema: def.inputSchema
    }, async (args: any): Promise<CallToolResult> => {
        const run = () => def.execute(args);
        const result = def.mutates
            ? await cls.init(() => sql.transactional(run))
            : await run();
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
    });
}

export function createMcpServer(): McpServer {
    const server = new McpServer({
        name: "trilium-notes",
        version: appInfo.appVersion
    });

    for (const registry of allToolRegistries) {
        for (const [name, def] of registry) {
            if (def.needsContext) continue;
            registerTool(server, name, def);
        }
    }

    return server;
}
