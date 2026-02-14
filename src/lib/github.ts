import { logger } from "./logger.js";

export interface GitHubConfig {
  defaultOwner?: string;
  defaultOrg?: string;
  defaultMergeMethod: "merge" | "squash" | "rebase";
}

interface ProxyConfig {
  url: string;
  key: string;
}

const GITHUB_API_TIMEOUT_MS = 30_000;

const MAX_ERROR_BODY_LENGTH = 200;

function sanitizeErrorBody(text: string): string {
  const trimmed = text.trim().slice(0, MAX_ERROR_BODY_LENGTH);
  return trimmed.length < text.trim().length ? trimmed + "..." : trimmed;
}

function getProxyConfig(): ProxyConfig {
  const url = process.env.GITHUB_PROXY_URL;
  const key = process.env.GITHUB_PROXY_KEY;
  if (!url || !key) {
    throw new Error(
      "GitHub proxy is not configured. Set GITHUB_PROXY_URL and GITHUB_PROXY_KEY environment variables.",
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

export function getGitHubConfig(): GitHubConfig {
  const mergeEnv = process.env.GITHUB_MERGE_METHOD;
  const validMergeMethods = ["merge", "squash", "rebase"] as const;
  const defaultMergeMethod = validMergeMethods.includes(
    mergeEnv as (typeof validMergeMethods)[number],
  )
    ? (mergeEnv as GitHubConfig["defaultMergeMethod"])
    : "merge";

  return {
    defaultOwner: process.env.GITHUB_OWNER || undefined,
    defaultOrg: process.env.GITHUB_ORG || undefined,
    defaultMergeMethod,
  };
}

export async function getDefaultBranch(
  owner: string,
  repo: string,
): Promise<string> {
  const repoData = await githubRest<{ default_branch: string }>(
    "GET",
    `/repos/${owner}/${repo}`,
  );
  return repoData.default_branch;
}

export async function githubGraphQL<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  logger.debug("Executing GitHub GraphQL request");
  const proxy = getProxyConfig();

  let response: Response;
  try {
    response = await fetch(`${proxy.url}/graphql`, {
      method: "POST",
      headers: {
        "x-proxy-key": proxy.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(
        `GitHub GraphQL request timed out after ${GITHUB_API_TIMEOUT_MS}ms`,
      );
    }
    throw err;
  }

  if (!response.ok) {
    const text = await response.text();
    logger.debug(
      `GitHub GraphQL error response (status ${response.status}): ${text}`,
    );
    throw new Error(
      `GitHub GraphQL request failed with status ${response.status}: ${sanitizeErrorBody(text)}`,
    );
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map((e) => e.message).join("; ");
    throw new Error(`GitHub GraphQL errors: ${messages}`);
  }

  if (!json.data) {
    throw new Error("GitHub GraphQL response contained no data");
  }

  return json.data;
}

/**
 * Execute a GitHub REST API request via the proxy.
 *
 * Note: A 204 (No Content) response is returned as an empty object (`{} as T`).
 * Callers that need to distinguish 204 from a normal response should check the
 * semantics of the endpoint they are calling (e.g., DELETE operations).
 */
export async function githubRest<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  logger.debug(`Executing GitHub REST ${method} ${path}`);
  const proxy = getProxyConfig();

  const url = `${proxy.url}/rest${path}`;
  const headers: Record<string, string> = {
    "x-proxy-key": proxy.key,
    Accept: "application/json",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(
        `GitHub REST ${method} ${path} timed out after ${GITHUB_API_TIMEOUT_MS}ms`,
      );
    }
    throw err;
  }

  if (response.status === 204) {
    logger.debug(`GitHub REST ${method} ${path} returned 204 No Content`);
    return {} as T;
  }

  if (!response.ok) {
    const text = await response.text();
    logger.debug(
      `GitHub REST error response (${method} ${path}, status ${response.status}): ${text}`,
    );
    throw new Error(
      `GitHub REST ${method} ${path} failed with status ${response.status}: ${sanitizeErrorBody(text)}`,
    );
  }

  return (await response.json()) as T;
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
