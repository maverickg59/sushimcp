#!/usr/bin/env node

import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from '../package.json' with { type: 'json' };
import { parseCliArgs } from './cli.js';
import {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import {
  list_llms_txt_sources,
  fetch_llms_txt,
  FetchDocsInputSchema,
  } from "./tools.js";
import { z } from "zod";

// --- Parse CLI Arguments --- //
const { docSources, allowedDomains } = parseCliArgs();

// --- MCP Server Setup --- //
const server = new McpServer({
  name: "SushiMCP",
  version: packageJson.version,
  displayName: "SushiMCP",
  description: "SushiMCP is a dev tools MCP Server designed to serve up context on a roll, just like your favorite restaurant.",
  publisher: "Chris White <chris@chriswhite.rocks>",
});

// --- Register Tools --- //
server.tool(
  "list_llms_txt_sources",
  "Lists the source urls configured for llms.txt.",
  (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) =>
    list_llms_txt_sources(extra, docSources)
);

server.tool(
  "fetch_llms_txt",
  "Fetches the content of a llms.txt source.",
  FetchDocsInputSchema.shape,
  (
    params: z.infer<typeof FetchDocsInputSchema>,
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>
  ) => fetch_llms_txt(params, extra, allowedDomains)
);

// --- Start Server --- //
console.error("Starting SushiMCP...");
try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "SushiMCP started (stdio transport). Listening for MCP requests."
  );
} catch (error: any) {
  console.error(`Failed to start MCP server: ${error.message}`);
  process.exit(1);
}

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
