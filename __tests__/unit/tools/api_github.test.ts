import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#lib/api_client", () => ({
  proxyGitHubIssues: vi.fn(),
  proxyGitHubPullRequests: vi.fn(),
  proxyGitHubProjects: vi.fn(),
}));

vi.mock("#lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  api_github_issues,
  api_github_pull_requests,
  api_github_projects,
} from "#tools/api_github";
import {
  proxyGitHubIssues,
  proxyGitHubPullRequests,
  proxyGitHubProjects,
} from "#lib/api_client";

const mockIssues = vi.mocked(proxyGitHubIssues);
const mockPRs = vi.mocked(proxyGitHubPullRequests);
const mockProjects = vi.mocked(proxyGitHubProjects);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("api_github_issues", () => {
  it("should proxy input and return formatted JSON", async () => {
    const apiResponse = { issues: [{ id: 1, title: "Bug" }] };
    mockIssues.mockResolvedValue(apiResponse);

    const input = { action: "list" as const, repo: "test-repo" };
    const result = await api_github_issues(input);

    expect(mockIssues).toHaveBeenCalledWith(input);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual(apiResponse);
  });

  it("should format response as pretty JSON", async () => {
    mockIssues.mockResolvedValue({ id: 1 });
    const result = await api_github_issues({ action: "list" as const, repo: "r" });
    expect(result.content[0].text).toBe(JSON.stringify({ id: 1 }, null, 2));
  });
});

describe("api_github_pull_requests", () => {
  it("should proxy input and return formatted JSON", async () => {
    const apiResponse = { pulls: [{ id: 42, title: "Feature" }] };
    mockPRs.mockResolvedValue(apiResponse);

    const input = { action: "list" as const, repo: "test-repo" };
    const result = await api_github_pull_requests(input);

    expect(mockPRs).toHaveBeenCalledWith(input);
    expect(JSON.parse(result.content[0].text)).toEqual(apiResponse);
  });
});

describe("api_github_projects", () => {
  it("should proxy input and return formatted JSON", async () => {
    const apiResponse = { items: [{ id: 1, title: "Task" }] };
    mockProjects.mockResolvedValue(apiResponse);

    const input = { action: "list" as const, projectNumber: 5 };
    const result = await api_github_projects(input);

    expect(mockProjects).toHaveBeenCalledWith(input);
    expect(JSON.parse(result.content[0].text)).toEqual(apiResponse);
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
