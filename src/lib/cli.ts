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
import { logger } from "./logger.js";

const VERSION = getVersion();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CliConfig {
  docSources: Record<string, string>;
  allowedDomains: Set<string>;
  openApiSpecs: Record<string, string>;
}

// Source loading functions
/** @internal */
export function loadDefaultSources(
  defaultsPath: string,
): Record<string, string> {
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
    logger.error(
      `Failed to load default sources: ${error instanceof Error ? error.message : error}`,
    );
  }
  return defaultSources;
}

// Process different source types
/** @internal */
export function processSourceOptions(
  sources: Record<string, string>,
  singleOptions: string[] | undefined,
  singleFlagName: string,
  multipleOption: string | undefined,
  multipleFlagName: string,
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

/** @internal */
export function processDomainOptions(
  allowDomainOptions: string[] | undefined,
  allowDomainsOption: string | undefined,
  denyDomainOptions: string[] | undefined,
  denyDomainsOption: string | undefined,
  docSources: Record<string, string>,
  openApiSpecs: Record<string, string>,
): Set<string> {
  const allowedDomains = new Set<string>();
  const deniedDomains = new Set<string>();
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

  // Always add explicitly allowed domains from CLI flags
  if (userSpecifiedDomains) {
    logger.info("Using explicitly allowed domains from CLI flags");
  }

  // Add inferred domains from sources (always add these in addition to any explicitly allowed domains)
  inferDomainsFromSources(openApiSpecs, allowedDomains);
  inferDomainsFromSources(docSources, allowedDomains);

  // Process individual --deny-domain options
  if (denyDomainOptions && denyDomainOptions.length > 0) {
    userSpecifiedDomains = true;
    denyDomainOptions.forEach((domain) => {
      normalizeAndAddDomain(domain, deniedDomains, "--deny-domain");
    });
  }

  // Process space-separated --deny-domains option
  if (denyDomainsOption) {
    userSpecifiedDomains = true;
    const domainsList = denyDomainsOption.split(/\s+/);
    domainsList.forEach((domain) => {
      normalizeAndAddDomain(domain, deniedDomains, "--deny-domains");
    });
  }

  // Remove denied domains from allowed domains
  deniedDomains.forEach((domain) => {
    allowedDomains.delete(domain);
  });

  return allowedDomains;
}

/** @internal */
export function inferDomainsFromSources(
  sources: Record<string, string>,
  allowedDomains: Set<string>,
): void {
  Object.values(sources).forEach((url) => {
    try {
      if (url.startsWith("http:") || url.startsWith("https:")) {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        allowedDomains.add(hostname);
      }
    } catch (e) {
      logger.error(
        `Failed to parse source URL '${url}' for domain inference. Error: ${
          e instanceof Error ? e.message : String(e)
        }. Skipping.`,
      );
    }
  });

  // Warning messages
  if (allowedDomains.size === 0 && Object.keys(sources).length > 0) {
    logger.warn(
      "Warning: No remote URLs configured or parsed, and no explicit domains allowed. Fetching might be restricted to local files only.",
    );
  } else if (allowedDomains.size === 0) {
    logger.warn(
      "No domains could be inferred from sources. Only local file access will be allowed.",
    );
  }
}

// Main option processing functions
/** @internal */
export function getDocSources(
  options: OptionValues,
  includeDefaults: boolean,
): Record<string, string> {
  let docSources: Record<string, string> = {};
  let deprecatedDocSources: Record<string, string> = {};

  // Load defaults if needed
  if (includeDefaults) {
    const defaultsPath = path.resolve(__dirname, "static/defaults.md");
    docSources = loadDefaultSources(defaultsPath);
  }

  // Process URL options
  docSources = processSourceOptions(
    docSources,
    options.llmsTxtSource,
    "--llms-txt-source",
    options.llmsTxtSources,
    "--llms-txt-sources",
  );

  if (options?.url?.length > 0 || options?.urls?.length > 0) {
    logger.warn(
      "Warning: The --url and --urls options are deprecated. Use --llms-txt-source and --llms-txt-sources instead.",
    );
  }

  deprecatedDocSources = processSourceOptions(
    deprecatedDocSources,
    options.url,
    "--url",
    options.urls,
    "--urls",
  );

  // Merge deprecated sources into docSources
  Object.assign(docSources, deprecatedDocSources);

  if (Object.keys(docSources).length === 0) {
    logger.warn(
      "No documentation sources provided. Use --source to add sources.",
    );
  }

  return docSources;
}

/** @internal */
export function getOpenApiSpecs(options: OptionValues): Record<string, string> {
  let openApiSpecs: Record<string, string> = {};

  openApiSpecs = processSourceOptions(
    openApiSpecs,
    options.openapiSpecSource,
    "--openapi-spec-source",
    options.openapiSpecSources,
    "--openapi-spec-sources",
  );

  if (Object.keys(openApiSpecs).length === 0) {
    logger.warn(
      "No OpenAPI specs provided. Use --openapi to add OpenAPI specs.",
    );
  }

  return openApiSpecs;
}

// Main CLI parsing function
export function parseCliArgs(): CliConfig {
  const program = new Command();
  program
    .name("SushiMCP")
    .description(
      "Starts SushiMCP, a dev tools model context protocol server that serves context on a roll.",
    )
    .version(VERSION)
    .option(
      // DEPRECATED: Use --llms-txt-source instead
      "--url <name:url>",
      "Specify a single documentation source (repeatable)",
      (value, previous: string[] = []) => previous.concat(value),
      [],
    )
    .option(
      // DEPRECATED: Use --llms-txt-sources instead
      "--urls <string>",
      "Specify a list of llms.txt sources as a single space-separated string (e.g., 'name1:url1 name2:url2')",
    )
    .option(
      "--llms-txt-source <name:url>",
      "Specify a single documentation source (repeatable)",
      (value, previous: string[] = []) => previous.concat(value),
      [],
    )
    .option(
      "--llms-txt-sources <string>",
      "Specify a list of llms.txt sources as a single space-separated string (e.g., 'name1:url1 name2:url2')",
    )
    .option(
      "--openapi-spec-source <name:url>",
      "Specify a single OpenAPI spec source (repeatable)",
      (value, previous: string[] = []) => previous.concat(value),
      [],
    )
    .option(
      "--openapi-spec-sources <string>",
      "Specify a list of OpenAPI spec sources as a single space-separated string (e.g., 'name1:url1 name2:url2')",
    )
    .option(
      "--no-defaults",
      "Do NOT include default documentation sources from src/defaults.md",
    )
    .option(
      "--allow-domain <domain>",
      "Allow fetching from a specific domain (repeatable, use '*' for all)",
      (value, previous: string[] = []) => previous.concat(value),
      [],
    )
    .option(
      "--allow-domains <string>",
      "Allow fetching from a list of domains as a single space-separated string (e.g., 'domain1 domain2')",
    )
    .option(
      "--deny-domain <domain>",
      "Deny fetching from a specific domain (repeatable, use '*' for all)",
      (value, previous: string[] = []) => previous.concat(value),
      [],
    )
    .option(
      "--deny-domains <string>",
      "Deny fetching from a list of domains as a single space-separated string (e.g., 'domain1 domain2')",
    );

  program.parse(process.argv);
  const options = program.opts();

  // Process all options
  const docSources = getDocSources(options, options.defaults);
  const openApiSpecs = getOpenApiSpecs(options);
  const allowedDomains = processDomainOptions(
    options.allowDomain,
    options.allowDomains,
    options.denyDomain,
    options.denyDomains,
    docSources,
    openApiSpecs,
  );

  // Create the final config
  const config = { allowedDomains, docSources, openApiSpecs };

  // Log summary if in appropriate mode
  logConfigSummary(config);

  return config;
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
