import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { githubRest, githubGraphQL, getGitHubConfig } from "#lib/github.js";
import {
  resolveProjectV2,
  updateProjectItemFields,
} from "#lib/github_utils.js";
import { logger } from "#lib/index.js";
import type { GitHubIssuesInput } from "./tool_schemas.js";

async function getIssueNodeId(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<string> {
  const data = await githubGraphQL<{
    repository: { issue: { id: string } };
  }>(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) { id }
      }
    }`,
    { owner, repo, number: issueNumber },
  );

  if (!data.repository?.issue?.id) {
    throw new Error(`Could not find issue #${issueNumber} in ${owner}/${repo}`);
  }

  return data.repository.issue.id;
}

export const github_issues = async (
  input: GitHubIssuesInput,
): Promise<CallToolResult> => {
  const { action } = input;
  const config = getGitHubConfig();
  const owner = input.owner || config.defaultOwner;
  if (!owner) {
    throw new Error(
      "No owner configured. Set the GITHUB_OWNER environment variable.",
    );
  }
  const repo = input.repo;
  if (!repo) {
    throw new Error("repo is required for issue operations.");
  }
  logger.debug(`github_issues: action=${action} ${owner}/${repo}`);

  switch (action) {
    case "list": {
      const state = input.state || "open";
      const params = new URLSearchParams({
        state,
        per_page: "100",
      });
      if (input.labels?.length) {
        params.set("labels", input.labels.join(","));
      }
      if (input.assignee) {
        params.set("assignee", input.assignee);
      }

      const issues = await githubRest<
        Array<{
          number: number;
          title: string;
          state: string;
          user: { login: string };
          labels: Array<{ name: string }>;
          assignees: Array<{ login: string }>;
          milestone: { title: string; number: number } | null;
          created_at: string;
          updated_at: string;
          pull_request?: unknown;
        }>
      >("GET", `/repos/${owner}/${repo}/issues?${params.toString()}`);

      const filtered = issues.filter((i) => !i.pull_request);

      const summary = filtered.map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user.login,
        labels: issue.labels.map((l) => l.name),
        assignees: issue.assignees.map((a) => a.login),
        milestone: issue.milestone?.title ?? null,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
      }));

      const truncated = issues.length === 100;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: summary.length,
                truncated,
                ...(truncated
                  ? {
                      note: "Results truncated. Refine filters for more specific results.",
                    }
                  : {}),
                items: summary,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "get": {
      if (!input.issueNumber) {
        throw new Error("issueNumber is required for the get action");
      }

      const issue = await githubRest<{
        number: number;
        title: string;
        body: string | null;
        state: string;
        user: { login: string };
        labels: Array<{ name: string }>;
        assignees: Array<{ login: string }>;
        milestone: { title: string; number: number } | null;
        comments: number;
        created_at: string;
        updated_at: string;
        closed_at: string | null;
        html_url: string;
      }>("GET", `/repos/${owner}/${repo}/issues/${input.issueNumber}`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                number: issue.number,
                title: issue.title,
                body: issue.body,
                state: issue.state,
                author: issue.user.login,
                labels: issue.labels.map((l) => l.name),
                assignees: issue.assignees.map((a) => a.login),
                milestone: issue.milestone?.title ?? null,
                commentCount: issue.comments,
                url: issue.html_url,
                createdAt: issue.created_at,
                updatedAt: issue.updated_at,
                closedAt: issue.closed_at,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "create": {
      if (!input.title) {
        throw new Error("title is required for the create action");
      }

      const payload: Record<string, unknown> = {
        title: input.title,
        body: input.body ?? "",
      };
      if (input.labels?.length) {
        payload.labels = input.labels;
      }
      if (input.assignee) {
        payload.assignees = [input.assignee];
      }

      const created = await githubRest<{
        number: number;
        html_url: string;
        title: string;
        state: string;
      }>("POST", `/repos/${owner}/${repo}/issues`, payload);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: "Issue created successfully",
                number: created.number,
                url: created.html_url,
                title: created.title,
                state: created.state,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "update": {
      if (!input.issueNumber) {
        throw new Error("issueNumber is required for the update action");
      }

      const payload: Record<string, unknown> = {};
      if (input.title !== undefined) payload.title = input.title;
      if (input.body !== undefined) payload.body = input.body;
      if (input.state !== undefined) payload.state = input.state;
      if (input.labels !== undefined) payload.labels = input.labels;
      if (input.assignee !== undefined) payload.assignees = [input.assignee];

      const updated = await githubRest<{
        number: number;
        title: string;
        state: string;
        html_url: string;
      }>(
        "PATCH",
        `/repos/${owner}/${repo}/issues/${input.issueNumber}`,
        payload,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: "Issue updated successfully",
                number: updated.number,
                title: updated.title,
                state: updated.state,
                url: updated.html_url,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "close": {
      if (!input.issueNumber) {
        throw new Error("issueNumber is required for the close action");
      }

      const closed = await githubRest<{
        number: number;
        state: string;
        title: string;
      }>("PATCH", `/repos/${owner}/${repo}/issues/${input.issueNumber}`, {
        state: "closed",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: "Issue closed",
                number: closed.number,
                state: closed.state,
                title: closed.title,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "add_to_project": {
      if (!input.issueNumber) {
        throw new Error(
          "issueNumber is required for the add_to_project action",
        );
      }
      if (!input.projectNumber) {
        throw new Error(
          "projectNumber is required for the add_to_project action",
        );
      }

      const { projectNodeId, ownerLogin, ownerType } =
        await resolveProjectV2(owner, input.projectNumber);

      const issueNodeId = await getIssueNodeId(owner, repo, input.issueNumber);

      const data = await githubGraphQL<{
        addProjectV2ItemById: { item: { id: string } };
      }>(
        `mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: {
            projectId: $projectId
            contentId: $contentId
          }) {
            item { id }
          }
        }`,
        { projectId: projectNodeId, contentId: issueNodeId },
      );

      const projectItemId = data.addProjectV2ItemById.item.id;

      // Update fields if any were provided
      const fieldResult = await updateProjectItemFields(
        projectNodeId,
        projectItemId,
        {
          status: input.status,
          iteration: input.iteration,
          priority: input.priority,
        },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: "Issue added to project",
                projectItemId: projectItemId,
                issueNumber: input.issueNumber,
                projectNumber: input.projectNumber,
                projectOwner: ownerLogin,
                projectOwnerType: ownerType,
                ...(fieldResult.updated.length > 0
                  ? { fieldsUpdated: fieldResult.updated }
                  : {}),
                ...(fieldResult.failed.length > 0
                  ? { fieldsFailed: fieldResult.failed }
                  : {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    default: {
      const exhaustiveCheck: never = action;
      throw new Error(`Unknown action: ${exhaustiveCheck}`);
    }
  }
};

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
