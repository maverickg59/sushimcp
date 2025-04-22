#!/usr/bin/env node
import { Command } from "commander";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import {
  RequestHandlerExtra,
} from "@modelcontextprotocol/sdk/shared/protocol.js";
import { z } from "zod";
import packageJson from '../package.json' with { type: 'json' };

import {
  list_llms_txt_sources,
  fetch_llms_txt,
  FetchDocsInputSchema
} from './tools.js';

// --- CLI Setup ---
const program = new Command();
program
  .name("SushiMCP")
  .description("Starts an MCP server to interact with documentation sources.")
  .version(packageJson.version)
  .option(
    "--url <name:url...>",
    "Add a documentation source. Format: Name:URL. Can be specified multiple times."
  )
  .option(
    "-a, --allowed-domain <domains...>",
    "Explicitly allow fetching from these hostnames (repeatable)"
  )
  .parse(process.argv);

const options = program.opts();

// --- Process URLs and Domains ---
const docSources: Record<string, string> = {};
const allowedDomains = new Set<string>();
const remoteSourceDomains = new Set<string>();

if (options.url && options.url.length > 0) {
  for (const urlArg of options.url) {
    const parts = urlArg.split(":");
    if (parts.length >= 2) {
      const name = parts[0];
      const urlValue = parts.slice(1).join(":");
      if (name && urlValue) {
        docSources[name] = urlValue;
        try {
          const parsedUrl = new URL(urlValue);
          if (
            parsedUrl.protocol === "http:" ||
            parsedUrl.protocol === "https:"
          ) {
            remoteSourceDomains.add(parsedUrl.hostname.toLowerCase());
          }
        } catch (e) {
          console.error(
            `Could not parse '${urlValue}' as URL for domain extraction.`
          );
        }
      } else {
        console.error(
          `Skipping invalid --url entry (empty name or URL): ${urlArg}`
        );
      }
    } else {
      console.error(`Skipping invalid --url format (missing ':'): ${urlArg}`);
    }
  }
}

if (Object.keys(docSources).length === 0) {
  console.error(
    "Error: No valid documentation sources provided via --url 'Name:URL'. Exiting."
  );
  process.exit(1);
}

if (options.allowedDomain && options.allowedDomain.length > 0) {
  options.allowedDomain.forEach((domain: string) => {
    if (domain && domain.trim() !== "") {
      allowedDomains.add(domain.trim().toLowerCase());
    } else {
      console.error(
        `Skipping invalid --allowed-domain entry (empty): '${domain}'`
      );
    }
  });
}

if (!allowedDomains.has("*")) {
  remoteSourceDomains.forEach((domain) => allowedDomains.add(domain));
}

console.error("--- SushiMCP Configuration ---");
console.error(
  `Configured Documentation Sources: ${JSON.stringify(docSources)}`
);
console.error(
  `Effective Allowed Fetch Domains: ${[...allowedDomains].join(", ")}`
);
console.error("-------------------------------");

// --- MCP Server Setup --- //
const server = new McpServer({
  name: "SushiMCP",
  version: packageJson.version,
  displayName: "SushiMCP",
  description:
    "MCP server for accessing llms.txt documentation sources.",
  publisher: "Chris White <chris@chriswhite.rocks>",
});

// Register tools using server.tool()
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
  (params: z.infer<typeof FetchDocsInputSchema>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) =>
    fetch_llms_txt(params, extra, allowedDomains)
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