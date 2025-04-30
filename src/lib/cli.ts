// src/cli.ts
import { Command } from "commander";
import { URL } from "url";
import * as fs from "node:fs"; 
import * as path from "node:path"; 
import { fileURLToPath } from 'node:url'; 
import packageJson from '../package.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CliConfig {
  docSources: Record<string, string>;
  allowedDomains: Set<string>;
}

function parseUrlOption(optionString: string): { name: string; urlValue: string } | null {
    const parts = optionString.split(":");
    if (parts.length < 2) {
      console.error(
        `Invalid URL format: '${optionString}'. Expected 'name:URL'. Skipping.`
      );
      return null;
    }
    const name = parts[0].trim();
    const urlValue = parts.slice(1).join(":").trim(); 

    if (!name || !urlValue) {
         console.error(
           `Invalid URL format: '${optionString}'. Name or URL part is empty. Skipping.`
         );
         return null;
    }
    return { name, urlValue };
}

function addSource(
  docSources: Record<string, string>,
  name: string,
  urlValue: string,
  sourceOrigin: string 
) {
  try {
    new URL(urlValue); 
    docSources[name] = urlValue;
  } catch (e) {
    if (urlValue.startsWith("/") || urlValue.startsWith(".")) {
      const absolutePath = path.resolve(urlValue);
      docSources[name] = absolutePath;
    } else {
      console.error(
        `(${sourceOrigin}) Invalid URL or Path format for source '${name}': '${urlValue}'. Skipping. Error: ${e instanceof Error ? e.message : e}`
      );
    }
  }
}

function loadDefaultSources(defaultsPath: string): Record<string, string> {
    const defaultSources: Record<string, string> = {};
    try {
      const defaultsContent = fs.readFileSync(defaultsPath, 'utf-8');
      const lines = defaultsContent.split('\n');
      for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('-')) {
              const content = trimmedLine.substring(1).trim(); 
              const parsed = parseUrlOption(content);
              if (parsed) {
                 addSource(defaultSources, parsed.name, parsed.urlValue, "defaults");
              }
          }
      }
    } catch (error) {
      console.error(`Error reading or parsing defaults file at ${defaultsPath}:`, error);
    }
    return defaultSources;
}

function applyUrlOptions(
    docSources: Record<string, string>,
    urlOptions: string[] | undefined
) {
    if (!urlOptions) return;
    for (const urlOption of urlOptions) {
       const parsed = parseUrlOption(urlOption);
        if (parsed) {
            addSource(docSources, parsed.name, parsed.urlValue, "--url");
        }
    }
}

function applyUrlsOption(
    docSources: Record<string, string>,
    urlsOption: string | undefined
) {
    if (!urlsOption) return;
    const individualUrls = urlsOption.split(/\s+/);
    for (const urlString of individualUrls) {
        if (urlString.trim()) {
            const parsed = parseUrlOption(urlString.trim());
            if (parsed) {
                addSource(docSources, parsed.name, parsed.urlValue, "--urls");
            }
        }
    }
}

function processUrlOptions(
    urlOptions: string[] | undefined,
    urlsOption: string | undefined,
    includeDefaults: boolean
): Record<string, string> {
  let docSources: Record<string, string> = {}; 

  if (includeDefaults) {
    const defaultsPath = path.resolve(__dirname, 'static/defaults.md'); 
    docSources = loadDefaultSources(defaultsPath); 
  }

  applyUrlOptions(docSources, urlOptions);
  applyUrlsOption(docSources, urlsOption);

  if (Object.keys(docSources).length === 0) {
    console.error(
      "Warning: No documentation sources were configured (check defaults, --url, --urls)."
    );
  }

  return docSources;
}

function processAllowDomainOptions(
  allowDomainOptions: string[] | undefined,
  docSources: Record<string, string>
): Set<string> {
  const allowedDomains = new Set<string>();

  if (allowDomainOptions && allowDomainOptions.length > 0) {
    allowDomainOptions.forEach((domain: string) => {
      const normalizedDomain = domain.trim().toLowerCase();
      if (normalizedDomain) {
        allowedDomains.add(normalizedDomain);
      } else {
         console.error(`Skipping empty --allow-domain entry.`);
      }
    });
  } else {
    Object.values(docSources).forEach((url) => {
      try {
        if (url.startsWith('http:') || url.startsWith('https:')) {
            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname.toLowerCase();
            allowedDomains.add(hostname);
        }
      } catch (e) {
         console.error(`Warning: Could not parse source URL '${url}' for default domain inference. Skipping.`);
      }
    });
     if (allowedDomains.size === 0 && Object.keys(docSources).length > 0) {
        console.error("Warning: No remote URLs configured or parsed, and no explicit --allow-domain. Fetching might be restricted to local files only.");
     } else if (allowedDomains.size === 0) {
        console.error("Warning: No domains specified or inferred. Fetching might be restricted.");
     }
  }
  return allowedDomains;
}

export function parseCliArgs(): CliConfig {
  const program = new Command();
  program
    .name("SushiMCP")
    .description("Starts SushiMCP, a dev tools MCP Server designed to serve up context on a roll, just like your favorite restaurant.")
    .version(packageJson.version)
    .option(
      "--url <name:url>",
      "Specify a single documentation source (repeatable)",
      (value, previous: string[] = []) => previous.concat(value),
      []
    )
    .option( 
        "--urls <string>",
        "Specify multiple documentation sources as a single space-separated string (e.g., \"name1:url1 name2:url2\")"
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
    );

  program.parse(process.argv);
  const options = program.opts();

  const includeDefaults = options.noDefaults !== true;

  const docSources = processUrlOptions(options.url, options.urls, includeDefaults);
  const allowedDomains = processAllowDomainOptions(options.allowDomain, docSources);

  console.info('\n--- SushiMCP Configuration Summary ---');
  console.info(
    `Final Documentation Sources: ${JSON.stringify(docSources, null, 2)}`
  );
  console.info(
    `Final Allowed Fetch Domains: ${[...allowedDomains].join(", ") || "(None - local only?)"}`
  );
  console.info("------------------------------------\\n");

  return { docSources, allowedDomains };
}

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later