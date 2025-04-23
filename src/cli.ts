// src/cli.ts
import { Command } from "commander";
import { URL } from "url";
import packageJson from '../package.json' with { type: 'json' };

export interface CliConfig {
  docSources: Record<string, string>;
  allowedDomains: Set<string>;
}

// --- URL Processing --- //
function processUrlOptions(urlOptions: string[] | undefined): Record<string, string> {
  const docSources: Record<string, string> = {};
  if (!urlOptions) {
    return docSources;
  }

  for (const urlOption of urlOptions) {
    const parts = urlOption.split(":");
    if (parts.length < 2) {
      console.error(
        `Invalid --url format: '${urlOption}'. Expected 'name:URL'. Skipping.`
      );
      continue;
    }
    const name = parts[0];
    const urlValue = parts.slice(1).join(":");

    try {
      new URL(urlValue);
      docSources[name] = urlValue;
      console.error(`Registered source: ${name} -> ${urlValue}`);
    } catch (e) {
      if (urlValue.startsWith("/") || urlValue.startsWith(".")) {
        docSources[name] = urlValue;
        console.error(`Registered local source: ${name} -> ${urlValue}`);
      } else {
        console.error(
          `Invalid URL or Path format for source '${name}': '${urlValue}'. Skipping. Error: ${e instanceof Error ? e.message : e}`
        );
      }
    }
  }

  if (Object.keys(docSources).length === 0) {
    console.error(
      "Warning: No valid documentation sources were successfully processed from --url options."
    );
  }

  return docSources;
}

// --- Allow Domain Processing --- //
function processAllowDomainOptions(
  allowDomainOptions: string[] | undefined,
  docSources: Record<string, string> // Pass docSources to infer defaults
): Set<string> {
  const allowedDomains = new Set<string>();

  if (allowDomainOptions && allowDomainOptions.length > 0) {
    console.error("Processing explicitly provided --allow-domain options...");
    allowDomainOptions.forEach((domain: string) => {
      const normalizedDomain = domain.trim().toLowerCase();
      if (normalizedDomain) {
        allowedDomains.add(normalizedDomain);
        console.error(`-> Allowed domain: ${normalizedDomain}`);
      } else {
        console.error(`Skipping empty --allow-domain entry.`);
      }
    });
  } else {
    console.error(
      "No --allow-domain specified. Defaulting to allow domains from provided remote --url sources only."
    );
    Object.values(docSources).forEach((url) => {
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
          const hostname = parsedUrl.hostname.toLowerCase();
          allowedDomains.add(hostname);
          console.error(`-> Default allowed domain (from ${url}): ${hostname}`);
        }
      } catch (e) {
        console.error(`Warning: Skipping non-URL source during default domain inference: ${url}`);
      }
    });
    if (allowedDomains.size === 0 && Object.keys(docSources).length > 0) {
      console.error("Warning: No remote URLs provided, and no explicit --allow-domain. Fetching might be restricted to local files only.");
     } else if (allowedDomains.size === 0) {
        console.error("Warning: No domains specified or inferred. Fetching might be restricted.");
     }
  }
  return allowedDomains;
}

/**
 * Parses command-line arguments using commander and returns
 * the processed documentation sources and allowed domains.
 */
export function parseCliArgs(): CliConfig {
  const program = new Command();
  program
    .name("SushiMCP")
    .description("Starts an MCP server to interact with documentation sources.")
    .version(packageJson.version)
    .option(
      "--url <name:url>",
      "Specify a documentation source as name:URL (repeatable)",
      (value, previous: string[] = []) => previous.concat(value),
      []
    )
    .option(
      "--allow-domain <domain>",
      "Allow fetching from a specific domain (repeatable, use '*' for all)",
      (value, previous: string[] = []) => previous.concat(value),
      []
    );

  program.parse(process.argv);
  const options = program.opts();

  // --- Process CLI Options --- //
  const docSources = processUrlOptions(options.url);
  const allowedDomains = processAllowDomainOptions(options.allowDomain, docSources);

  // --- Configuration Summary --- //
  console.error("--- SushiMCP Configuration Summary ---");
  console.error(
    `Final Documentation Sources: ${JSON.stringify(docSources)}`
  );
  console.error(
    `Final Allowed Fetch Domains: ${[...allowedDomains].join(", ") || "(None - local only?)"}`
  );
  console.error("------------------------------------\\n");
  return { docSources, allowedDomains };
}

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later