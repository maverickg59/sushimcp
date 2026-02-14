import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { github_issues } from "#tools/github_issues";
import { github_pull_requests } from "#tools/github_pull_requests";
import { github_projects } from "#tools/github_projects";
import * as github from "#lib/github";
import { resetAllMocks } from "../../test-utils.js";

vi.mock("#lib/github", async () => {
  const actual = await vi.importActual("#lib/github");
  return {
    ...actual,
    getGitHubConfig: vi.fn().mockReturnValue({
      defaultOwner: "testowner",
      defaultOrg: "testorg",
      defaultMergeMethod: "merge",
    }),
    getDefaultBranch: vi.fn().mockResolvedValue("main"),
    githubRest: vi.fn(),
    githubGraphQL: vi.fn(),
  };
});

describe("GitHub BDD Workflow", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetAllMocks();
    vi.mocked(github.githubGraphQL).mockReset();
    vi.mocked(github.githubRest).mockReset();
    vi.mocked(github.getGitHubConfig).mockReset().mockReturnValue({
      defaultOwner: "testowner",
      defaultOrg: "testorg",
      defaultMergeMethod: "merge",
    });
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should support a full issue-to-PR-to-project workflow", async () => {
    // Step 1: Create an issue with a BDD spec
    vi.mocked(github.githubRest).mockResolvedValueOnce({
      number: 10,
      html_url: "https://github.com/testowner/testrepo/issues/10",
      title: "Implement login feature",
      state: "open",
    });

    const issueResult = await github_issues({
      action: "create",
      repo: "testrepo",
      title: "Implement login feature",
      body: "As a user, I want to log in so that I can access my account.",
      labels: ["feature", "bdd"],
    });

    const issueParsed = JSON.parse(
      (issueResult.content[0] as { text: string }).text,
    );
    expect(issueParsed.message).toBe("Issue created successfully");
    expect(issueParsed.number).toBe(10);

    // Step 2: Add the issue to a project board
    vi.mocked(github.githubGraphQL)
      .mockResolvedValueOnce({
        user: {
          projectV2: {
            id: "PVT_board1",
            owner: { login: "testowner", __typename: "User" },
          },
        },
      })
      .mockResolvedValueOnce({
        repository: { issue: { id: "I_issue10" } },
      })
      .mockResolvedValueOnce({
        addProjectV2ItemById: { item: { id: "PVTI_item10" } },
      });

    const addResult = await github_issues({
      action: "add_to_project",
      repo: "testrepo",
      issueNumber: 10,
      projectNumber: 1,
    });

    const addParsed = JSON.parse(
      (addResult.content[0] as { text: string }).text,
    );
    expect(addParsed.message).toBe("Issue added to project");
    expect(addParsed.projectItemId).toBe("PVTI_item10");

    // Step 3: Create a PR referencing the issue
    vi.mocked(github.githubRest).mockResolvedValueOnce({
      number: 25,
      html_url: "https://github.com/testowner/testrepo/pull/25",
      title: "feat: implement login feature",
      state: "open",
    });

    const prResult = await github_pull_requests({
      action: "create",
      repo: "testrepo",
      title: "feat: implement login feature",
      body: "Closes #10\n\nImplements the login feature per BDD spec.",
      head: "feature/login",
    });

    const prParsed = JSON.parse((prResult.content[0] as { text: string }).text);
    expect(prParsed.message).toBe("Pull request created successfully");
    expect(prParsed.number).toBe(25);

    // Step 4: Add a review comment to the PR
    vi.mocked(github.githubRest).mockResolvedValueOnce({
      id: 501,
      html_url: "https://github.com/testowner/testrepo/pull/25#comment-501",
    });

    const commentResult = await github_pull_requests({
      action: "comment",
      repo: "testrepo",
      pullNumber: 25,
      commentBody: "All BDD scenarios pass. Approving.",
    });

    const commentParsed = JSON.parse(
      (commentResult.content[0] as { text: string }).text,
    );
    expect(commentParsed.message).toBe("General comment posted");

    // Step 5: Merge the PR
    vi.mocked(github.githubRest).mockResolvedValueOnce({
      sha: "merged_abc123",
      merged: true,
      message: "Pull Request successfully merged",
    });

    const mergeResult = await github_pull_requests({
      action: "merge",
      repo: "testrepo",
      pullNumber: 25,
    });

    const mergeParsed = JSON.parse(
      (mergeResult.content[0] as { text: string }).text,
    );
    expect(mergeParsed.merged).toBe(true);

    // Step 6: Close the issue
    vi.mocked(github.githubRest).mockResolvedValueOnce({
      number: 10,
      state: "closed",
      title: "Implement login feature",
    });

    const closeResult = await github_issues({
      action: "close",
      repo: "testrepo",
      issueNumber: 10,
    });

    const closeParsed = JSON.parse(
      (closeResult.content[0] as { text: string }).text,
    );
    expect(closeParsed.message).toBe("Issue closed");
    expect(closeParsed.state).toBe("closed");

    // Step 7: Verify project board state
    vi.mocked(github.githubGraphQL)
      .mockResolvedValueOnce({
        user: {
          projectV2: {
            id: "PVT_board1",
            owner: { login: "testowner", __typename: "User" },
          },
        },
      })
      .mockResolvedValueOnce({
        node: {
          title: "Project Board",
          number: 1,
          owner: { login: "testowner", __typename: "User" },
          items: {
            pageInfo: { hasNextPage: false },
            nodes: [
              {
                id: "PVTI_item10",
                type: "ISSUE",
                fieldValues: {
                  nodes: [
                    {
                      name: "Done",
                      field: { name: "Status" },
                    },
                  ],
                },
                content: {
                  title: "Implement login feature",
                  body: "As a user, I want to log in so that I can access my account.",
                  assignees: { nodes: [] },
                },
              },
            ],
          },
        },
      });

    const projectResult = await github_projects({
      action: "list",
      projectNumber: 1,
    });

    const projectParsed = JSON.parse(
      (projectResult.content[0] as { text: string }).text,
    );
    expect(projectParsed.items).toHaveLength(1);
    expect(projectParsed.items[0].content.title).toBe(
      "Implement login feature",
    );
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
