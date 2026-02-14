// src/lib/cli_lib.ts
import { URL } from "url";
import * as path from "node:path";
import { CliConfig } from "./cli.js";
import { extractDomain } from "./utils.js";
import { logger } from "./logger.js";

export interface ParsedNameUrl {
  name: string;
  urlValue: string;
}

/**
 * Parse a string into a name-value pair using the specified delimiter
 */
export function parseNameValuePair(
  input: string,
  delimiter = ":",
): ParsedNameUrl | null {
  const parts = input.split(delimiter);
  if (parts.length < 2) {
    logger.error(
      `Invalid format: '${input}'. Expected 'name${delimiter}value'. Skipping.`,
    );
    return null;
  }

  const name = parts[0].trim();
  const urlValue = parts.slice(1).join(delimiter).trim();

  if (!name || !urlValue) {
    logger.error(
      `Invalid format: '${input}'. Name or value part is empty. Skipping.`,
    );
    return null;
  }

  return { name, urlValue };
}

/**
 * Validate and add a URL or file path to the target record
 */
export function validateAndAddSource(
  target: Record<string, string>,
  name: string,
  urlValue: string,
  sourceOrigin: string,
): void {
  try {
    new URL(urlValue);
    target[name] = urlValue;
  } catch (e) {
    // Handle local file paths
    if (urlValue.startsWith("/") || urlValue.startsWith(".")) {
      const absolutePath = path.resolve(urlValue);
      target[name] = absolutePath;
    } else {
      logger.error(
        `(${sourceOrigin}) Invalid URL or Path format for '${name}': '${urlValue}'. Skipping. Error: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }
}

/**
 * Process a list of space-separated items using the provided processor function
 */
export function processSpaceSeparatedItems<T>(
  input: string | undefined,
  processor: (item: string) => T | null,
  errorPrefix: string,
): T[] {
  const results: T[] = [];

  if (!input) return results;

  const items = input.split(/\\s+/);
  for (const item of items) {
    if (!item.trim()) continue;

    const result = processor(item.trim());
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Process multiple items using the provided processor function
 */
export function processMultipleItems<T>(
  items: string[] | undefined,
  processor: (item: string) => T | null,
  errorPrefix: string,
): T[] {
  const results: T[] = [];

  if (!items || items.length === 0) return results;

  for (const item of items) {
    const result = processor(item);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Add a parsed source to the target record
 */
export function addParsedSourceToTarget(
  source: ParsedNameUrl,
  target: Record<string, string>,
  origin: string,
): void {
  validateAndAddSource(target, source.name, source.urlValue, origin);
}

/**
 * Normalize and add a domain to the target set
 */
export function normalizeAndAddDomain(
  domain: string,
  target: Set<string>,
  origin: string,
): void {
  const extractedDomain = extractDomain(domain.trim());
  if (extractedDomain) {
    target.add(extractedDomain);
    logger.info(`Added domain ${extractedDomain} from ${origin}`);
  }
}

/**
 * Log the configuration summary if in appropriate mode
 */
export function logConfigSummary(config: CliConfig): void {
  logger.info("\n--- SushiMCP Configuration Summary ---");
  logger.info(
    `Documentation Sources: ${JSON.stringify(config.docSources, null, 2)}`,
  );
  logger.info(`OpenAPI Specs: ${JSON.stringify(config.openApiSpecs, null, 2)}`);
  logger.info(
    `Allowed Fetch Domains: ${
      [...config.allowedDomains].join(", ") || "(None - local only?)"
    }`,
  );
  logger.info("------------------------------------\n");
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
