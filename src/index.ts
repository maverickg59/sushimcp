#!/usr/bin/env node
import { Command } from "commander";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolResult,
  TextContent,
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import {
  RequestHandlerExtra,
} from "@modelcontextprotocol/sdk/shared/protocol.js";
import { z } from "zod";
import fs from "fs/promises";
import { fileURLToPath, URL } from "url";
import path from "path";
import packageJson from '../package.json' with { type: 'json' };

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

// --- Tool Definition --- //
const FetchDocsInputSchema = z.object({
  url: z.string().url("Input must contain a valid URL string under the 'url' key.")
});

const list_doc_sources_tool_handler = async (
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<CallToolResult> => {
  let formatted_sources = "Available documentation sources:\n";
  for (const name in docSources) {
    formatted_sources += `- ${name}: ${docSources[name]}\n`;
  }
  const content: TextContent[] = [
    { type: "text", text: formatted_sources.trim() },
  ];
  return { content };
};

const fetch_docs_tool_handler = async (
  // Params type is now inferred from the object schema
  params: z.infer<typeof FetchDocsInputSchema>,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<CallToolResult> => {

  // Destructure url directly from the params object
  const { url } = params;

  console.error(`Processing fetchDocs request for URL: ${url}`);

  type TargetInfo =
    | { type: "remote"; url: URL; hostname: string }
    | { type: "localFileUrl"; filePath: string }
    | { type: "localPath"; resolvedPath: string }
    | { type: "unsupported"; reason: string };

  function parseFetchTarget(targetUrlString: string): TargetInfo {
    try {
      const targetUrl = new URL(targetUrlString);
      if (targetUrl.protocol === "http:" || targetUrl.protocol === "https:") {
        return {
          type: "remote",
          url: targetUrl,
          hostname: targetUrl.hostname.toLowerCase(),
        };
      } else if (targetUrl.protocol === "file:") {
        try {
          const filePath = fileURLToPath(targetUrlString);
          return { type: "localFileUrl", filePath };
        } catch (err) {
          return {
            type: "unsupported",
            reason: `Failed to convert file: URL to path: ${err}`,
          };
        }
      } else {
        return {
          type: "unsupported",
          reason: `Unsupported URL protocol: ${targetUrl.protocol}`,
        };
      }
    } catch (e) {
      if (
        e instanceof TypeError &&
        (e.message.includes("Invalid URL") ||
          e.message.includes("Invalid protocol"))
      ) {
        try {
          const resolvedPath = path.resolve(targetUrlString);
          return { type: "localPath", resolvedPath };
        } catch (pathErr) {
          return {
            type: "unsupported",
            reason: `Failed to resolve as local path: ${pathErr}`,
          };
        }
      } else {
        return { type: "unsupported", reason: `Initial parsing error: ${e}` };
      }
    }
  }
  async function fetchContent(targetInfo: TargetInfo): Promise<string> {
    switch (targetInfo.type) {
      case "remote": {
        console.error(`Fetching remote URL: ${targetInfo.url.toString()}`);
        const response = await fetch(targetInfo.url.toString());
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        return await response.text();
      }
      case "localFileUrl":
        console.error(
          `Reading local file path from file: URL: ${targetInfo.filePath}`
        );
        return await fs.readFile(targetInfo.filePath, "utf-8");
      case "localPath":
        console.error(
          `Reading local file path directly: ${targetInfo.resolvedPath}`
        );
        return await fs.readFile(targetInfo.resolvedPath, "utf-8");
      case "unsupported":
        throw new Error(
          `Cannot fetch unsupported target: ${targetInfo.reason}`
        );
      default:
        throw new Error("Internal error: Unknown fetch target type");
    }
  }

  function checkSecurity(
    targetInfo: TargetInfo,
    allowedDomains: Set<string>
  ): void {
    switch (targetInfo.type) {
      case "remote":
        if (
          !allowedDomains.has("*") &&
          !allowedDomains.has(targetInfo.hostname)
        ) {
          console.error(
            `Access denied: Domain '${
              targetInfo.hostname
            }' is not in the allowed list: ${[...allowedDomains].join(", ")}`
          );
          throw new Error(
            `Access denied: Fetching from domain '${targetInfo.hostname}' is not allowed by server configuration.`
          );
        }
        console.error(`Domain '${targetInfo.hostname}' is allowed.`);
        break;
      case "localFileUrl":
      case "localPath":
        console.error("Local file access permitted.");
        // Add more checks here if needed (e.g., ensure path is within a specific root?)
        break;
      case "unsupported":
        // Error already thrown during parsing or will be thrown by fetchContent
        break;
    }
  }

  try {
    const targetInfo = parseFetchTarget(url);

    checkSecurity(targetInfo, allowedDomains);

    const contentText = await fetchContent(targetInfo);
    const content: TextContent[] = [{ type: "text", text: contentText }];
    return { content };
  } catch (error: any) {
    console.error(`Error in handleFetchDocs for '${url}': ${error.message}`);
    if (error.code === "ENOENT") {
      throw new Error(`File not found: ${url}`);
    }
    throw new Error(
      `Failed to process fetch request for '${url}': ${error.message}`
    );
  }
};

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
  "list_doc_sources",
  "Lists the configured documentation source URLs.",
  list_doc_sources_tool_handler
);

server.tool(
  "fetch_docs",
  FetchDocsInputSchema.shape,
  fetch_docs_tool_handler
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