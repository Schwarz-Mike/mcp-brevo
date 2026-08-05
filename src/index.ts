"use strict";
// Thin stdio entrypoint — kept for local single-tenant testing / backwards
// compatibility. The real deployment target is the multi-tenant web server
// in src/server.ts. Both share the same tool logic in src/brevo/tools.ts.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBrevoServer } from "./brevo/tools.js";

async function main(): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY || "";
  if (!apiKey) {
    console.error("[brevo-stdio] BREVO_API_KEY is not set");
    process.exit(1);
  }
  const server = createBrevoServer(apiKey, "brevo");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Brevo MCP Server (stdio) running — Contacts, Lists, Folders, Transactional Emails & Campaigns");
}

main().catch((err) => {
  console.error("[brevo-stdio] fatal:", err);
  process.exit(1);
});
