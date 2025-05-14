// src/lib.ts
import { Command, OptionValues } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getVersion } from "./utils.js";
import {
  parseNameValuePair,
  addParsedSourceToTarget,
  normalizeAndAddDomain,
  logConfigSummary,
} from "./cli_lib.js";

const VERSION = getVersion();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CliConfig {
  docSources: Record<string, string>;
  allowedDomains: Set<string>;
  openApiSpecs: Record<string, string>;
}

// Source loading functions
function loadDefaultSources(defaultsPath: string): Record<string, string> {
  const defaultSources: Record<string, string> = {};
  try {
    const defaultsContent = fs.readFileSync(defaultsPath, "utf-8");
    const lines = defaultsContent.split("\n");

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("-")) {
        const content = trimmedLine.substring(1).trim();
        const parsed = parseNameValuePair(content);
        if (parsed) {
          addParsedSourceToTarget(parsed, defaultSources, "defaults");
        }
      }
    }
  } catch (error) {
    console.error(
      `Error reading or parsing defaults file at ${defaultsPath}:`,
      error
    );
  }
  return defaultSources;
}

// Process different source types
function processSourceOptions(
  sources: Record<string, string>,
  singleOptions: string[] | undefined,
  singleFlagName: string,
  multipleOption: string | undefined,
  multipleFlagName: string
): Record<string, string> {
  // Process individual options
  if (singleOptions && singleOptions.length > 0) {
    for (const option of singleOptions) {
      const parsed = parseNameValuePair(option);
      if (parsed) {
        addParsedSourceToTarget(parsed, sources, singleFlagName);
      }
    }
  }

  // Process space-separated option
  if (multipleOption) {
    const items = multipleOption.split(/\s+/);
    for (const item of items) {
      if (!item.trim()) continue;

      const parsed = parseNameValuePair(item.trim());
      if (parsed) {
        addParsedSourceToTarget(parsed, sources, multipleFlagName);
      }
    }
  }

  return sources;
}

function processDomainOptions(
  allowDomainOptions: string[] | undefined,
  allowDomainsOption: string | undefined,
  docSources: Record<string, string>
): Set<string> {
  const allowedDomains = new Set<string>();
  let userSpecifiedDomains = false;

  // Process individual --allow-domain options
  if (allowDomainOptions && allowDomainOptions.length > 0) {
    userSpecifiedDomains = true;
    allowDomainOptions.forEach((domain) => {
      normalizeAndAddDomain(domain, allowedDomains, "--allow-domain");
    });
  }

  // Process space-separated --allow-domains option
  if (allowDomainsOption) {
    userSpecifiedDomains = true;
    const domainsList = allowDomainsOption.split(/\s+/);
    domainsList.forEach((domain) => {
      normalizeAndAddDomain(domain, allowedDomains, "--allow-domains");
    });
  }

  // If no domains were specified, infer from docSources
  if (!userSpecifiedDomains) {
    inferDomainsFromSources(docSources, allowedDomains);
  }

  return allowedDomains;
}

function inferDomainsFromSources(
  sources: Record<string, string>,
  allowedDomains: Set<string>
): void {
  Object.values(sources).forEach((url) => {
    try {
      if (url.startsWith("http:") || url.startsWith("https:")) {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        allowedDomains.add(hostname);
      }
    } catch (e) {
      console.error(
        `Warning: Could not parse source URL '${url}' for domain inference. Error: ${
          e instanceof Error ? e.message : String(e)
        }. Skipping.`
      );
    }
  });

  // Warning messages
  if (allowedDomains.size === 0 && Object.keys(sources).length > 0) {
    console.error(
      "Warning: No remote URLs configured or parsed, and no explicit domains allowed. Fetching might be restricted to local files only."
    );
  } else if (allowedDomains.size === 0) {
    console.error(
      "Warning: No domains specified or inferred. Fetching might be restricted."
    );
  }
}

// Main option processing functions
function getDocSources(
  options: OptionValues,
  includeDefaults: boolean
): Record<string, string> {
  let docSources: Record<string, string> = {};

  // Load defaults if needed
  if (includeDefaults) {
    const defaultsPath = path.resolve(__dirname, "static/defaults.md");
    docSources = loadDefaultSources(defaultsPath);
  }

  // Process URL options
  docSources = processSourceOptions(
    docSources,
    options.url,
    "--url",
    options.urls,
    "--urls"
  );

  if (Object.keys(docSources).length === 0) {
    console.error(
      "Warning: No documentation sources were configured (check defaults, --url, --urls)."
    );
  }

  return docSources;
}

function getOpenApiSpecs(
  options: OptionValues,
  includeDefaults: boolean
): Record<string, string> {
  const openApiSpecs: Record<string, string> = {};

  // Process OpenAPI spec options
  return processSourceOptions(
    openApiSpecs,
    options.openApiSpec,
    "--openapi-spec",
    options.openApiSpecs,
    "--openapi-specs"
  );
}

// Main CLI parsing function
export function parseCliArgs(): CliConfig {
  const program = new Command();
  program
    .name("SushiMCP")
    .description(
      "Starts SushiMCP, a dev tools model context protocol server that serves context on a roll."
    )
    .version(VERSION)
    .option(
      "--url <name:url>",
      "Specify a single documentation source (repeatable)",
      (value, previous: string[] = []) => previous.concat(value),
      []
    )
    .option(
      "--urls <string>",
      "Specify a list of documentation sources as a single space-separated string (e.g., 'name1:url1 name2:url2')"
    )
    .option(
      "--openapi-spec <name:url>",
      "Specify a single OpenAPI spec source (repeatable)",
      (value, previous: string[] = []) => previous.concat(value),
      []
    )
    .option(
      "--openapi-specs <string>",
      "Specify a list of OpenAPI spec sources as a single space-separated string (e.g., 'name1:url1 name2:url2')"
    )
    .option(
      "--no-defaults",
      "Do NOT include default documentation sources from src/defaults.md"
    )
    .option(
      "--allow-domain <domain>",
      "Allow fetching from a specific domain (repeatable, use '*' for all)",
      (value, previous: string[] = []) => previous.concat(value),
      []
    )
    .option(
      "--allow-domains <domain>",
      "Allow fetching from a list of domains as a single space-separated string (e.g., 'domain1 domain2')"
    );

  program.parse(process.argv);
  const options = program.opts();
  const includeDefaults = options.noDefaults !== true;

  // Process all options
  const docSources = getDocSources(options, includeDefaults);
  const openApiSpecs = getOpenApiSpecs(options, includeDefaults);
  const allowedDomains = processDomainOptions(
    options.allowDomain,
    options.allowDomains,
    docSources
  );

  // Create the final config
  const config = { docSources, allowedDomains, openApiSpecs };

  // Log summary if in appropriate mode
  logConfigSummary(config);

  return config;
}

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
