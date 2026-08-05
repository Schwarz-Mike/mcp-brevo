"use strict";
// Streamable-HTTP bridge with per-session MCP servers. Sessions are kept in
// memory, keyed by the Mcp-Session-Id the transport issues on `initialize`.
// Each session is bound to one tenant's decrypted Brevo API key.

import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createBrevoServer } from "./brevo/tools.js";

interface Session {
  transport: StreamableHTTPServerTransport;
  tenant: string;
}

const sessions = new Map<string, Session>();

function isInitialize(body: unknown): boolean {
  if (Array.isArray(body)) return body.some(isInitialize);
  return !!body && typeof body === "object" && (body as { method?: string }).method === "initialize";
}

/**
 * Handle one MCP HTTP request for a tenant.
 *  - `initialize` (no session id)  -> create a session bound to this tenant.
 *  - subsequent requests (with id) -> reuse the session, verifying the tenant.
 * The caller has already authenticated the Bearer token and resolved apiKey.
 */
export async function handleTenantMcp(
  req: Request,
  res: Response,
  apiKey: string,
  tenantName: string
): Promise<void> {
  const sid = req.headers["mcp-session-id"] as string | undefined;

  // --- Existing session ---
  if (sid && sessions.has(sid)) {
    const s = sessions.get(sid)!;
    if (s.tenant !== tenantName) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session does not belong to this tenant." },
        id: null,
      });
      return;
    }
    await s.transport.handleRequest(req, res, req.body);
    return;
  }

  // --- New session: only valid on an initialize POST ---
  if (req.method === "POST" && !sid && isInitialize(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, tenant: tenantName });
        console.log(`[mcp:${tenantName}] session opened ${id.slice(0, 8)}… (${sessions.size} active)`);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
        console.log(`[mcp:${tenantName}] session closed ${transport.sessionId.slice(0, 8)}…`);
      }
    };

    const server = createBrevoServer(apiKey, `brevo-${tenantName}`);
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error(`[mcp:${tenantName}] init error:`, err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
    return;
  }

  // --- No session and not an initialize request ---
  res.status(400).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Bad Request: no valid session id (call initialize first)." },
    id: null,
  });
}
