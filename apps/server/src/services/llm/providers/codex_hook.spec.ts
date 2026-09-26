import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import { resolveCurlPath } from "./antigravity_hook.js";
import { buildCodexHookCommand, codexSearchSources, decideCodexToolCall, writeCodexHooks } from "./codex_hook.js";

/** `PreToolUse` events as Codex 0.146.0 and 0.156.1 send them, less the session bookkeeping. */
const EVENTS = {
    shell: { tool_name: "Bash", tool_input: { command: "cat /etc/hostname" } },
    viewImage: { tool_name: "view_image", tool_input: { path: "/etc/hostname", detail: "high" } },
    noteTool: { tool_name: "mcp__trilium__read_note", tool_input: { noteId: "abc" } },
    otherMcp: { tool_name: "mcp__codex_apps__send_email", tool_input: { to: "x" } },
    search: { tool_name: "webrun", tool_input: { search_query: [ { q: "latest Linux kernel" } ], response_length: "short" } },
    open: (url: string) => ({ tool_name: "webrun", tool_input: { open: [ { ref_id: "https://example.com/" }, { ref_id: url } ], response_length: "short" } })
};

const denied = (reason: RegExp) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: expect.stringMatching(reason) } });

describe("decideCodexToolCall", () => {
    const configs: Record<string, { enableWebSearch?: boolean }> = { web: { enableWebSearch: true }, offline: {} };
    const configOf = (sessionId: string) => configs[sessionId];
    // example.com resolves to a public address, everything else to a private one.
    const lookup = async (host: string) => (host === "example.com" ? [ "93.184.215.14" ] : [ "192.168.1.1" ]);
    const decide = (event: object, sessionId = "web") => decideCodexToolCall({ ...event, session_id: sessionId, hook_event_name: "PreToolUse" }, configOf, lookup);

    it("lets Trilium's note tools through and denies every other tool, whatever the chat allows", async () => {
        expect(await decide(EVENTS.noteTool)).toEqual({});
        for (const event of [ EVENTS.shell, EVENTS.viewImage, EVENTS.otherMcp, { tool_name: "browser_use" }, {} ]) {
            expect(await decide(event)).toEqual(denied(/note tools/));
        }
        expect(await decideCodexToolCall(null, configOf, lookup)).toEqual(denied(/note tools/));
    });

    it("lets the web search through only in a chat that allows it, and only to public addresses", async () => {
        expect(await decide(EVENTS.search)).toEqual({});
        expect(await decide(EVENTS.open("https://example.com/about"))).toEqual({});
        expect(await decide(EVENTS.open("http://router.lan/admin"))).toEqual(denied(/private addresses/));
        expect(await decide(EVENTS.search, "offline")).toEqual(denied(/turned off/));
        // A session no chat turn is attached to, such as the title's, has no web access.
        expect(await decide(EVENTS.search, "unknown")).toEqual(denied(/turned off/));
        expect(await decideCodexToolCall(EVENTS.search, configOf, lookup)).toEqual(denied(/turned off/));
    });
});

describe("Codex hook", () => {
    it("writes a hook before and after every tool call to hooks.json in Codex's home", () => {
        const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "trilium-codex-hook-")), "home");
        try {
            writeCodexHooks(home, "before", "after");
            expect(JSON.parse(fs.readFileSync(path.join(home, "hooks.json"), "utf8"))).toEqual({
                hooks: {
                    PreToolUse: [ { matcher: ".*", hooks: [ { type: "command", command: "before", timeout: 10 } ] } ],
                    PostToolUse: [ { matcher: ".*", hooks: [ { type: "command", command: "after", timeout: 10 } ] } ]
                }
            });
        } finally {
            fs.rmSync(path.dirname(home), { recursive: true, force: true });
        }
    });

    it("builds on Antigravity's curl command and exits with 2, which Codex reads as a denial, when Trilium cannot be reached", async () => {
        expect(buildCodexHookCommand("/usr/bin/curl", "http://127.0.0.1:1/hook-x/codex"))
            .toBe("\"/usr/bin/curl\" --silent --show-error --fail --noproxy 127.0.0.1 --max-time 8 --data-binary @- http://127.0.0.1:1/hook-x/codex || exit 2");

        // Port 1 on the loopback refuses the connection, as a stopped Trilium would.
        const command = buildCodexHookCommand(await resolveCurlPath(), "http://127.0.0.1:1/hook-x/codex");
        const shell = process.platform === "win32" ? [ "cmd", [ "/c", command ] ] as const : [ "sh", [ "-c", command ] ] as const;
        const exitCode = await new Promise<number | null>(resolve => {
            const child = execFile(shell[0], [ ...shell[1] ], error => resolve(error ? (error as { code?: number }).code ?? null : 0));
            child.stdin?.end("{}");
        });
        expect(exitCode).toBe(2);
    });
});

describe("codexSearchSources", () => {
    /** The start of a `webrun` response as Codex 0.156.1 sent it after a search. */
    const RESPONSE = [ { type: "input_text", text: [
        "Vremea în Sibiu pe 26 septembrie 2026 (Prognoza) (https://www.celsium.ro/vremea-sibiu/2026-09-26)",
        "\uE200cite\uE202turn1search0\uE201 [wordlim: 200] Crawled: 2 days ago; # Vremea în Sibiu",
        "some page text (https://example.com/not-a-header)",
        "Sibiu (https://en.wikipedia.org/wiki/Sibiu_(city))",
        "\uE200cite\uE202turn1search13\uE201 [wordlim: 200] Crawled: 4 months ago; Sibiu"
    ].join("\n") } ];
    const post = (extra: object) => ({ hook_event_name: "PostToolUse", session_id: "sess-1", tool_name: "webrun", tool_response: RESPONSE, ...extra });

    it("maps each search result's citation id to its title and URL", () => {
        expect(codexSearchSources(post({}))).toEqual({
            sessionId: "sess-1",
            sources: new Map([
                [ "turn1search0", { title: "Vremea în Sibiu pe 26 septembrie 2026 (Prognoza)", url: "https://www.celsium.ro/vremea-sibiu/2026-09-26" } ],
                [ "turn1search13", { title: "Sibiu", url: "https://en.wikipedia.org/wiki/Sibiu_(city)" } ]
            ])
        });
    });

    it("reads only a finished web search", () => {
        expect(codexSearchSources(post({ hook_event_name: "PreToolUse" }))).toBeUndefined();
        expect(codexSearchSources(post({ tool_name: "mcp__trilium__read_note" }))).toBeUndefined();
        expect(codexSearchSources(post({ session_id: undefined }))).toBeUndefined();
        expect(codexSearchSources(null)).toBeUndefined();
    });
});
