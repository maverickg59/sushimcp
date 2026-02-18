import { logger } from "./logger.js";

// --- Types --- //

export interface RepoIdentifier {
  owner: string;
  repo: string;
}

export interface RepoMetadata {
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  topics: string[];
  stars: number;
  license: string | null;
  homepage: string | null;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha: string;
}

export interface FetchedFile {
  path: string;
  content: string;
  size: number;
}

export interface FetchResult {
  fetched: FetchedFile[];
  skipped: string[];
  totalChars: number;
}

// --- URL Parsing --- //

/**
 * Parse a full GitHub URL into owner/repo.
 * Accepts: https://github.com/owner/repo (with optional trailing slash, .git suffix, or subpaths).
 * Rejects: owner/repo shorthand, non-GitHub URLs.
 */
export function parseRepoUrl(input: string): RepoIdentifier {
  const trimmed = input.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      `Invalid URL: "${trimmed}". Please provide a full GitHub URL like https://github.com/owner/repo`,
    );
  }

  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    throw new Error(
      `Not a GitHub URL: "${trimmed}". Only github.com URLs are supported.`,
    );
  }

  // Strip leading slash, trailing slash, .git suffix, and any subpaths beyond owner/repo
  const pathParts = url.pathname
    .replace(/^\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "")
    .split("/");

  const owner = pathParts[0];
  const repo = pathParts[1];

  if (!owner || !repo) {
    throw new Error(
      `Could not parse owner/repo from URL: "${trimmed}". Expected format: https://github.com/owner/repo`,
    );
  }

  return { owner, repo };
}

// --- Auth-aware Fetch --- //

/**
 * Fetch wrapper implementing unauthenticated-first auth strategy.
 * 1. Try without auth
 * 2. If 401/403 and GITHUB_TOKEN is set, retry once with Bearer token
 * 3. Otherwise return error
 */
export async function githubApiFetch(url: string): Promise<Response> {
  const controller1 = new AbortController();
  const timeout1 = setTimeout(() => controller1.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller1.signal,
    });
  } finally {
    clearTimeout(timeout1);
  }

  if (response.status !== 401 && response.status !== 403) {
    return response;
  }

  // Auth retry
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    logger.warn(
      `GitHub API returned ${response.status} for ${url}. Set GITHUB_TOKEN env var for authenticated access.`,
    );
    return response;
  }

  logger.debug(`Retrying ${url} with GITHUB_TOKEN auth`);
  const controller2 = new AbortController();
  const timeout2 = setTimeout(() => controller2.abort(), 15_000);

  try {
    return await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller2.signal,
    });
  } finally {
    clearTimeout(timeout2);
  }
}

// --- API Functions --- //

/**
 * Fetch repository metadata from GitHub API.
 */
export async function fetchRepoMetadata(
  id: RepoIdentifier,
): Promise<RepoMetadata> {
  const url = `https://api.github.com/repos/${id.owner}/${id.repo}`;
  const response = await githubApiFetch(url);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `GitHub API error ${response.status} for ${url}: ${body}`,
    );
  }

  const data = await response.json();
  return {
    owner: id.owner,
    repo: id.repo,
    fullName: data.full_name,
    description: data.description ?? null,
    defaultBranch: data.default_branch,
    language: data.language ?? null,
    topics: data.topics ?? [],
    stars: data.stargazers_count ?? 0,
    license: data.license?.spdx_id ?? data.license?.name ?? null,
    homepage: data.homepage || null,
  };
}

/**
 * Fetch the full recursive file tree for a branch.
 */
export async function fetchRepoTree(
  id: RepoIdentifier,
  branch: string,
): Promise<TreeEntry[]> {
  const url = `https://api.github.com/repos/${id.owner}/${id.repo}/git/trees/${branch}?recursive=1`;
  const response = await githubApiFetch(url);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `GitHub API error ${response.status} fetching tree for ${id.owner}/${id.repo}: ${body}`,
    );
  }

  const data = await response.json();

  if (data.truncated) {
    logger.warn(
      `Tree for ${id.owner}/${id.repo} was truncated by GitHub API (very large repo). Proceeding with partial results.`,
    );
  }

  return (data.tree as any[])
    .filter((entry: any) => entry.type === "blob")
    .map((entry: any) => ({
      path: entry.path,
      type: entry.type as "blob",
      size: entry.size,
      sha: entry.sha,
    }));
}

/**
 * Fetch a single raw file from raw.githubusercontent.com.
 */
export async function fetchRawFile(
  id: RepoIdentifier,
  branch: string,
  path: string,
): Promise<string> {
  const url = `https://raw.githubusercontent.com/${id.owner}/${id.repo}/${branch}/${path}`;
  const response = await githubApiFetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${path}: HTTP ${response.status}`,
    );
  }

  return response.text();
}

// --- Budget-constrained Fetching --- //

export interface ScoredFile {
  path: string;
  score: number;
}

/**
 * Fetch files in score order until budget is exhausted.
 * @param budget - Maximum total characters to fetch (default 150K)
 * @param concurrency - Number of concurrent fetches (default 5)
 */
export async function fetchFilesWithBudget(
  id: RepoIdentifier,
  branch: string,
  scoredFiles: ScoredFile[],
  budget: number = 150_000,
  concurrency: number = 5,
): Promise<FetchResult> {
  const fetched: FetchedFile[] = [];
  const skipped: string[] = [];
  let totalChars = 0;

  // Process in batches of `concurrency`
  for (let i = 0; i < scoredFiles.length; i += concurrency) {
    if (totalChars >= budget) {
      // Budget exhausted — skip remaining
      for (let j = i; j < scoredFiles.length; j++) {
        skipped.push(scoredFiles[j].path);
      }
      break;
    }

    const batch = scoredFiles.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((file) => fetchRawFile(id, branch, file.path)),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const filePath = batch[j].path;

      if (result.status === "fulfilled") {
        const content = result.value;
        if (totalChars + content.length > budget) {
          skipped.push(filePath);
          logger.debug(`Skipping ${filePath} — would exceed budget`);
          continue;
        }
        fetched.push({ path: filePath, content, size: content.length });
        totalChars += content.length;
      } else {
        logger.warn(`Failed to fetch ${filePath}: ${result.reason}`);
        skipped.push(filePath);
      }
    }
  }

  return { fetched, skipped, totalChars };
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
