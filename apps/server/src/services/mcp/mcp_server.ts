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
import { noteTools } from "../llm/tools/note_tools.js";
import { attributeTools } from "../llm/tools/attribute_tools.js";
import { hierarchyTools } from "../llm/tools/hierarchy_tools.js";
import { skillTools } from "../llm/skills/index.js";

import type { Tool } from "@ai-sdk/provider-utils";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Register an AI SDK tool on the MCP server.
 *
 * Bridges between the Vercel AI SDK `tool()` shape and the MCP SDK's
 * `registerTool()` API. Write operations are wrapped in CLS + transaction
 * context so that Becca entity tracking works correctly.
 */
function registerAiTool(
    server: McpServer,
    name: string,
    aiTool: Tool<any, any>,
    { mutates = false }: { mutates?: boolean } = {}
) {
    server.registerTool(name, {
        description: aiTool.description,
        inputSchema: aiTool.inputSchema
    }, async (args: any): Promise<CallToolResult> => {
        const run = () => aiTool.execute!(args, {} as any);
        const result = mutates
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

    // Note tools
    registerAiTool(server, "search_notes", noteTools.search_notes);
    registerAiTool(server, "read_note", noteTools.read_note);
    registerAiTool(server, "update_note_content", noteTools.update_note_content, { mutates: true });
    registerAiTool(server, "append_to_note", noteTools.append_to_note, { mutates: true });
    registerAiTool(server, "create_note", noteTools.create_note, { mutates: true });

    // Attribute tools
    registerAiTool(server, "get_attributes", attributeTools.get_attributes);
    registerAiTool(server, "get_attribute", attributeTools.get_attribute);
    registerAiTool(server, "set_attribute", attributeTools.set_attribute, { mutates: true });
    registerAiTool(server, "delete_attribute", attributeTools.delete_attribute, { mutates: true });

    // Hierarchy tools
    registerAiTool(server, "get_child_notes", hierarchyTools.get_child_notes);
    registerAiTool(server, "get_subtree", hierarchyTools.get_subtree);

    // Skill tools
    registerAiTool(server, "load_skill", skillTools.load_skill);

    return server;
}
