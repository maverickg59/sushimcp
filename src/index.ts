#!/usr/bin/env node

import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from '../package.json' with { type: 'json' };
import { parseCliArgs } from './lib/cli.js';
import {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import {
  fetch_llms_txt,
  FetchLlmsTxtInputSchema,
  sushi_digest,
  SushiDigestInputSchema,
} from "./tools/index.js";
import { list_llms_txt_sources } from "./tools/list_llms_txt_sources.js";
import { z } from "zod";

// --- Parse CLI Arguments --- //
const { docSources, allowedDomains } = parseCliArgs();

// --- MCP Server Setup --- //
const server = new McpServer({
  name: "SushiMCP",
  version: packageJson.version,
  displayName: "SushiMCP",
  description: "SushiMCP is a dev tools MCP Server designed to serve up context on a roll, just like your favorite restaurant.",
  publisher: "Chris White <chris@chriswhite.rocks> https://chriswhite.rocks",
},
{
    capabilities: {
      tools: {
        list_llms_txt_sources: {
          name: "list_llms_txt_sources",
          description: "Lists the source urls configured for llms.txt.",
          annotations: {
            title: "List registered llms.txt sources",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          }
        },
        fetch_llms_txt: {
          name: "fetch_llms_txt",
          description: "Fetches the content of a llms.txt source.",
          inputSchema: FetchLlmsTxtInputSchema,
          annotations: {
            title: "Fetch llms.txt content",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
            }
        },
        sushi_digest: {
          name: "sushi_digest",
          description: "Generates a local pseudo-llms.txt for a GitHub project.",
          inputSchema: SushiDigestInputSchema,
          annotations: {
            title: "Generate llms.txt for GitHub project.",
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
          }
        },
      },
    },
  },);

// --- Register Tools --- //
// Tool without parameters
server.tool(
  'list_llms_txt_sources',
  (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) =>
    list_llms_txt_sources(extra, docSources)
);

// For the fetch_llms_txt tool - it can handle both object and array formats
server.tool(
  'fetch_llms_txt',
  { url: z.string() },
  (params: { url: string }, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) =>
    fetch_llms_txt(params, extra, allowedDomains)
);

// For the sushi_digest tool
server.tool(
  'sushi_digest',
  { name: z.string() },
  (params: { name: string; }, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) =>
    sushi_digest(params, extra)
);

// --- Start Server --- //
console.info("Starting SushiMCP...");
try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.info(
    "SushiMCP started (stdio transport). Listening for MCP requests."
  );
} catch (error: any) {
  console.error(`Failed to start MCP server: ${error.message}`);
  process.exit(1);
}

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
