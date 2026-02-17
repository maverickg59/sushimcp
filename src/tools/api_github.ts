import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  proxyGitHubIssues,
  proxyGitHubPullRequests,
  proxyGitHubProjects,
} from "#lib/api_client.js";
import { logger } from "#lib/logger.js";
import type { GitHubIssuesInput } from "./tool_schemas.js";
import type { GitHubPullRequestsInput } from "./tool_schemas.js";
import type { GitHubProjectsInput } from "./tool_schemas.js";

function wrapApiResponse(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export const api_github_issues = async (
  input: GitHubIssuesInput,
): Promise<CallToolResult> => {
  logger.debug(`api_github_issues: action=${input.action}`);
  const data = await proxyGitHubIssues(input);
  return wrapApiResponse(data);
};

export const api_github_pull_requests = async (
  input: GitHubPullRequestsInput,
): Promise<CallToolResult> => {
  logger.debug(`api_github_pull_requests: action=${input.action}`);
  const data = await proxyGitHubPullRequests(input);
  return wrapApiResponse(data);
};

export const api_github_projects = async (
  input: GitHubProjectsInput,
): Promise<CallToolResult> => {
  logger.debug(`api_github_projects: action=${input.action}`);
  const data = await proxyGitHubProjects(input);
  return wrapApiResponse(data);
};

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
