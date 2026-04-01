/**
 * MCP (Model Context Protocol) HTTP route handler.
 *
 * Mounts the Streamable HTTP transport at `/mcp` with a localhost-only guard.
 * No authentication is required — access is restricted to loopback addresses.
 */

import type express from "express";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createMcpServer } from "../services/mcp/mcp_server.js";
import log from "../services/log.js";
import optionService from "../services/options.js";

const LOCALHOST_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function mcpGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (optionService.getOptionOrNull("mcpEnabled") !== "true") {
        res.status(403).json({ error: "MCP server is disabled. Enable it in Options > AI / LLM." });
        return;
    }

    if (!LOCALHOST_ADDRESSES.has(req.socket.remoteAddress ?? "")) {
        res.status(403).json({ error: "MCP is only available from localhost" });
        return;
    }

    next();
}

async function handleMcpRequest(req: express.Request, res: express.Response) {
    try {
        const server = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined // stateless
        });

        res.on("close", () => {
            transport.close();
            server.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (err) {
        log.error(`MCP request error: ${err}`);
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal MCP error" });
        }
    }
}

export function register(app: express.Application) {
    app.post("/mcp", mcpGuard, handleMcpRequest);
    app.get("/mcp", mcpGuard, handleMcpRequest);
    app.delete("/mcp", mcpGuard, handleMcpRequest);

    log.info("MCP server registered at /mcp (localhost only)");
}

export default { register };
