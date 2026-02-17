import { logger } from "./logger.js";

const API_TIMEOUT_MS = 30_000;
const MAX_ERROR_BODY_LENGTH = 200;

let apiUrl: string | undefined;
let apiKey: string | undefined;

export function initApiClient(url: string, key: string): void {
  apiUrl = url.replace(/\/$/, "");
  apiKey = key;
  logger.info("API client initialized for thin client mode");
}

export function isApiMode(): boolean {
  return !!(apiUrl && apiKey);
}

function getConfig(): { url: string; key: string } {
  if (!apiUrl || !apiKey) {
    throw new Error(
      "API client is not initialized. Set API_URL and API_KEY environment variables.",
    );
  }
  return { url: apiUrl, key: apiKey };
}

function sanitizeErrorBody(text: string): string {
  const trimmed = text.trim().slice(0, MAX_ERROR_BODY_LENGTH);
  return trimmed.length < text.trim().length ? trimmed + "..." : trimmed;
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const config = getConfig();
  const url = `${config.url}/api/v1${path}`;

  const headers: Record<string, string> = {
    "x-api-key": config.key,
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
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(
        `API ${method} ${path} timed out after ${API_TIMEOUT_MS}ms`,
      );
    }
    throw err;
  }

  if (!response.ok) {
    const text = await response.text();
    logger.debug(
      `API error response (${method} ${path}, status ${response.status}): ${text}`,
    );
    throw new Error(
      `API ${method} ${path} failed with status ${response.status}: ${sanitizeErrorBody(text)}`,
    );
  }

  return (await response.json()) as T;
}

export interface LlmsTxtSource {
  id: number;
  name: string;
  baseUrl: string;
  siteUrl: string | null;
  llmsTxtUrl: string | null;
  llmsFullTxtUrl: string | null;
  llmsMiniTxtUrl: string | null;
  description: string | null;
  category: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpenapiSource {
  id: number;
  name: string;
  url: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listLlmsTxtSources(): Promise<LlmsTxtSource[]> {
  return apiRequest<LlmsTxtSource[]>("GET", "/llms-txt-sources");
}

export async function searchLlmsTxtSources(
  query: string,
): Promise<LlmsTxtSource[]> {
  return apiRequest<LlmsTxtSource[]>(
    "GET",
    `/llms-txt-sources/search?q=${encodeURIComponent(query)}`,
  );
}

export async function listOpenapiSources(): Promise<OpenapiSource[]> {
  return apiRequest<OpenapiSource[]>("GET", "/openapi-sources");
}

export async function searchOpenapiSources(
  query: string,
): Promise<OpenapiSource[]> {
  return apiRequest<OpenapiSource[]>(
    "GET",
    `/openapi-sources/search?q=${encodeURIComponent(query)}`,
  );
}

export async function proxyGitHubIssues(input: unknown): Promise<unknown> {
  return apiRequest("POST", "/github/issues", input);
}

export async function proxyGitHubPullRequests(input: unknown): Promise<unknown> {
  return apiRequest("POST", "/github/pulls", input);
}

export async function proxyGitHubProjects(input: unknown): Promise<unknown> {
  return apiRequest("POST", "/github/projects", input);
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
