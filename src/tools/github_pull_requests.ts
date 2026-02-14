import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { githubRest, getGitHubConfig, getDefaultBranch } from "#lib/github.js";
import { logger } from "#lib/index.js";
import type { GitHubPullRequestsInput } from "./tool_schemas.js";

export const github_pull_requests = async (
  input: GitHubPullRequestsInput,
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
    throw new Error("repo is required for pull request operations.");
  }
  logger.debug(`github_pull_requests: action=${action} ${owner}/${repo}`);

  switch (action) {
    case "list": {
      const state = input.state || "open";
      const params = new URLSearchParams({ state, per_page: "100" });

      const pulls = await githubRest<
        Array<{
          number: number;
          title: string;
          state: string;
          user: { login: string };
          head: { ref: string };
          base: { ref: string };
          created_at: string;
          updated_at: string;
          draft: boolean;
          labels: Array<{ name: string }>;
        }>
      >("GET", `/repos/${owner}/${repo}/pulls?${params.toString()}`);

      const summary = pulls.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        author: pr.user.login,
        head: pr.head.ref,
        base: pr.base.ref,
        draft: pr.draft,
        labels: pr.labels.map((l) => l.name),
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      }));

      const truncated = pulls.length === 100;
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
      if (!input.pullNumber) {
        throw new Error("pullNumber is required for the get action");
      }
      const pr = await githubRest<{
        number: number;
        title: string;
        body: string;
        state: string;
        merged: boolean;
        mergeable: boolean | null;
        mergeable_state: string;
        user: { login: string };
        head: { ref: string; sha: string };
        base: { ref: string };
        additions: number;
        deletions: number;
        changed_files: number;
        draft: boolean;
        labels: Array<{ name: string }>;
        requested_reviewers: Array<{ login: string }>;
        created_at: string;
        updated_at: string;
      }>("GET", `/repos/${owner}/${repo}/pulls/${input.pullNumber}`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                number: pr.number,
                title: pr.title,
                body: pr.body,
                state: pr.state,
                merged: pr.merged,
                mergeable: pr.mergeable,
                mergeableState: pr.mergeable_state,
                author: pr.user.login,
                head: { ref: pr.head.ref, sha: pr.head.sha },
                base: pr.base.ref,
                additions: pr.additions,
                deletions: pr.deletions,
                changedFiles: pr.changed_files,
                draft: pr.draft,
                labels: pr.labels.map((l) => l.name),
                requestedReviewers: pr.requested_reviewers.map((r) => r.login),
                createdAt: pr.created_at,
                updatedAt: pr.updated_at,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "create": {
      if (!input.title || !input.head) {
        throw new Error("title and head are required for the create action");
      }
      const base = input.base || (await getDefaultBranch(owner, repo));
      const created = await githubRest<{
        number: number;
        html_url: string;
        title: string;
        state: string;
      }>("POST", `/repos/${owner}/${repo}/pulls`, {
        title: input.title,
        body: input.body ?? "",
        head: input.head,
        base,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: "Pull request created successfully",
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

    case "list_comments": {
      if (!input.pullNumber) {
        throw new Error("pullNumber is required for the list_comments action");
      }

      const [reviewComments, issueComments] = await Promise.all([
        githubRest<
          Array<{
            id: number;
            body: string;
            path: string;
            line: number | null;
            side: string;
            user: { login: string };
            created_at: string;
            updated_at: string;
          }>
        >(
          "GET",
          `/repos/${owner}/${repo}/pulls/${input.pullNumber}/comments?per_page=100`,
        ),
        githubRest<
          Array<{
            id: number;
            body: string;
            user: { login: string };
            created_at: string;
            updated_at: string;
          }>
        >(
          "GET",
          `/repos/${owner}/${repo}/issues/${input.pullNumber}/comments?per_page=100`,
        ),
      ]);

      const truncated =
        reviewComments.length === 100 || issueComments.length === 100;
      const result = {
        truncated,
        ...(truncated
          ? {
              note: "Results truncated. Some comments may not be shown.",
            }
          : {}),
        reviewComments: reviewComments.map((c) => ({
          id: c.id,
          body: c.body,
          path: c.path,
          line: c.line,
          side: c.side,
          author: c.user.login,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        })),
        generalComments: issueComments.map((c) => ({
          id: c.id,
          body: c.body,
          author: c.user.login,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        })),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "comment": {
      if (!input.pullNumber || !input.commentBody) {
        throw new Error(
          "pullNumber and commentBody are required for the comment action",
        );
      }

      if (input.commentPath && !input.commitId) {
        throw new Error(
          "commitId is required when commentPath is provided for inline review comments.",
        );
      }

      if (input.commentPath && input.commitId) {
        const inlineComment = await githubRest<{
          id: number;
          html_url: string;
        }>(
          "POST",
          `/repos/${owner}/${repo}/pulls/${input.pullNumber}/comments`,
          {
            body: input.commentBody,
            path: input.commentPath,
            commit_id: input.commitId,
            line: input.commentLine ?? 1,
            side: input.commentSide ?? "RIGHT",
          },
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: "Inline review comment posted",
                  commentId: inlineComment.id,
                  url: inlineComment.html_url,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const generalComment = await githubRest<{
        id: number;
        html_url: string;
      }>(
        "POST",
        `/repos/${owner}/${repo}/issues/${input.pullNumber}/comments`,
        {
          body: input.commentBody,
        },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: "General comment posted",
                commentId: generalComment.id,
                url: generalComment.html_url,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "request_reviewers": {
      if (!input.pullNumber || !input.reviewers?.length) {
        throw new Error(
          "pullNumber and reviewers are required for the request_reviewers action",
        );
      }

      const result = await githubRest<{
        requested_reviewers: Array<{ login: string }>;
      }>(
        "POST",
        `/repos/${owner}/${repo}/pulls/${input.pullNumber}/requested_reviewers`,
        { reviewers: input.reviewers },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: "Reviewers requested",
                requestedReviewers: result.requested_reviewers.map(
                  (r) => r.login,
                ),
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "merge": {
      if (!input.pullNumber) {
        throw new Error("pullNumber is required for the merge action");
      }

      const merged = await githubRest<{
        sha: string;
        merged: boolean;
        message: string;
      }>("PUT", `/repos/${owner}/${repo}/pulls/${input.pullNumber}/merge`, {
        merge_method: input.mergeMethod ?? config.defaultMergeMethod,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: merged.message,
                merged: merged.merged,
                sha: merged.sha,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "close": {
      if (!input.pullNumber) {
        throw new Error("pullNumber is required for the close action");
      }

      const closed = await githubRest<{
        number: number;
        state: string;
        title: string;
      }>("PATCH", `/repos/${owner}/${repo}/pulls/${input.pullNumber}`, {
        state: "closed",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: "Pull request closed",
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

    default: {
      const exhaustiveCheck: never = action;
      throw new Error(`Unknown action: ${exhaustiveCheck}`);
    }
  }
};

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
