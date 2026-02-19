import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { getCacheDir } from "./cache.js";
import { logger } from "./logger.js";
import type { LinkEntry } from "./web_parser.js";

export interface LinkIndex {
  domain: string;
  updatedAt: number;
  sources: string[];
  links: LinkEntry[];
}

function linksDir(): string {
  return join(getCacheDir(), "links");
}

function indexFileName(domain: string): string {
  const hash = createHash("sha256").update(domain).digest("hex").slice(0, 16);
  return `${hash}.json`;
}

async function ensureLinksDir(): Promise<string> {
  const dir = linksDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * Read the link index for a domain. Returns null if no index exists.
 */
export async function readLinkIndex(domain: string): Promise<LinkIndex | null> {
  const dir = linksDir();
  const filePath = join(dir, indexFileName(domain));

  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as LinkIndex;
  } catch {
    return null;
  }
}

/**
 * Write (or merge into) the link index for a domain.
 * Merges new source URLs and links with any existing index, deduplicating links by URL.
 */
export async function writeLinkIndex(
  domain: string,
  sourceUrls: string[],
  links: LinkEntry[],
): Promise<void> {
  const dir = await ensureLinksDir();
  const filePath = join(dir, indexFileName(domain));

  // Read existing index to merge
  let existing: LinkIndex | null = null;
  try {
    const raw = await readFile(filePath, "utf-8");
    existing = JSON.parse(raw) as LinkIndex;
  } catch {
    // No existing index
  }

  // Merge sources
  const mergedSources = [...new Set([
    ...(existing?.sources || []),
    ...sourceUrls,
  ])];

  // Merge and deduplicate links by URL
  const seenUrls = new Set<string>();
  const mergedLinks: LinkEntry[] = [];

  // Existing links first (preserve order)
  for (const link of existing?.links || []) {
    if (!seenUrls.has(link.url)) {
      seenUrls.add(link.url);
      mergedLinks.push(link);
    }
  }
  // New links
  for (const link of links) {
    if (!seenUrls.has(link.url)) {
      seenUrls.add(link.url);
      mergedLinks.push(link);
    }
  }

  const index: LinkIndex = {
    domain,
    updatedAt: Date.now(),
    sources: mergedSources,
    links: mergedLinks,
  };

  await writeFile(filePath, JSON.stringify(index, null, 2), { mode: 0o600 });
  logger.debug(`Wrote link index for ${domain}: ${mergedLinks.length} links from ${mergedSources.length} sources`);
}

/**
 * Search links by query string. Case-insensitive substring match against link text and URL.
 * If domain is specified, searches only that domain's index. Otherwise searches all indices.
 */
export async function searchLinks(
  query: string,
  domain?: string,
): Promise<LinkEntry[]> {
  const lowerQuery = query.toLowerCase();

  if (domain) {
    const index = await readLinkIndex(domain);
    if (!index) return [];
    return index.links.filter(
      (link) =>
        link.text.toLowerCase().includes(lowerQuery) ||
        link.url.toLowerCase().includes(lowerQuery),
    );
  }

  // Search all indices
  const dir = linksDir();
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const results: LinkEntry[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(dir, file), "utf-8");
      const index = JSON.parse(raw) as LinkIndex;
      for (const link of index.links) {
        if (
          link.text.toLowerCase().includes(lowerQuery) ||
          link.url.toLowerCase().includes(lowerQuery)
        ) {
          results.push(link);
        }
      }
    } catch {
      // Skip corrupt files
    }
  }

  return results;
}

/**
 * List all domains that have a link index.
 */
export async function listLinkIndexDomains(): Promise<string[]> {
  const dir = linksDir();
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const domains: string[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(dir, file), "utf-8");
      const index = JSON.parse(raw) as LinkIndex;
      domains.push(index.domain);
    } catch {
      // Skip corrupt files
    }
  }

  return domains;
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
