import { z } from "zod";

/**
 * Schema for URL-based fetch operations that can accept:
 * - A single URL string
 * - A single URL object
 * - An array of URL strings and/or objects
 */
export const UrlFetchInputSchema = z.union([
  z.url(),
  z.object({
    url: z.url(),
  }),
  z.array(
    z.union([
      z.url(),
      z.object({
        url: z.url(),
      }),
    ]),
  ),
]);

// Type exports for use in function parameters
export type UrlFetchInput = z.infer<typeof UrlFetchInputSchema>;

/**
 * Schema for GitHub Projects operations.
 * Supports listing, getting, creating, updating, and deleting project items.
 */
export const GitHubProjectsInputSchema = z.object({
  action: z
    .enum(["list", "get", "create", "update", "delete"])
    .describe("The operation to perform on the GitHub Project"),
  owner: z
    .string()
    .optional()
    .describe(
      "Override for the repository owner. Already configured via environment. Only provide if the user explicitly specifies a different owner.",
    ),
  projectNumber: z
    .number()
    .int()
    .positive()
    .describe("The project number (from the project URL)"),
  itemId: z
    .string()
    .optional()
    .describe(
      "The node ID of the project item (required for get, update, delete)",
    ),
  title: z
    .string()
    .optional()
    .describe("Title for a new draft issue (required for create)"),
  body: z.string().optional().describe("Body text for a new draft issue"),
  fieldId: z
    .string()
    .optional()
    .describe("The field ID to update (required for update)"),
  fieldValue: z
    .string()
    .optional()
    .describe("The text value to set on the field"),
  statusOptionId: z
    .string()
    .optional()
    .describe("The single select option ID for status updates"),
  status: z
    .string()
    .optional()
    .describe(
      "Human-readable status value for update (e.g., 'In Progress', 'Done') - auto-discovers field ID",
    ),
  iterationId: z
    .string()
    .optional()
    .describe("The iteration ID for iteration field updates"),
  iteration: z
    .string()
    .optional()
    .describe(
      "Human-readable iteration value for update (e.g., 'current', 'Iteration 1') - auto-discovers field ID",
    ),
  priority: z
    .string()
    .optional()
    .describe(
      "Human-readable priority value for update (e.g., 'P0', 'P1') - auto-discovers field ID",
    ),
});

export type GitHubProjectsInput = z.infer<typeof GitHubProjectsInputSchema>;

/**
 * Schema for GitHub Pull Requests operations.
 * Supports creating, listing, reading, commenting, reviewing, merging, and closing PRs.
 */
export const GitHubPullRequestsInputSchema = z.object({
  action: z
    .enum([
      "list",
      "get",
      "create",
      "list_comments",
      "comment",
      "request_reviewers",
      "merge",
      "close",
    ])
    .describe("The operation to perform on pull requests"),
  owner: z
    .string()
    .optional()
    .describe(
      "Override for the repository owner. Already configured via environment. Only provide if the user explicitly specifies a different owner.",
    ),
  repo: z
    .string()
    .describe("The repository name. Required for all pull request operations."),
  pullNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Pull request number (required for all actions except list and create)",
    ),
  state: z
    .enum(["open", "closed", "all"])
    .optional()
    .describe("PR state filter for list action (default: 'open')"),
  title: z.string().optional().describe("PR title (required for create)"),
  body: z.string().optional().describe("PR body or description"),
  head: z
    .string()
    .optional()
    .describe("The branch containing changes (required for create)"),
  base: z
    .string()
    .optional()
    .describe(
      "The branch to merge into. Auto-detected from the repository default branch. Only provide if the user explicitly specifies a different base branch.",
    ),
  mergeMethod: z
    .enum(["merge", "squash", "rebase"])
    .optional()
    .describe(
      "Merge strategy. Already configured via environment. Only provide if the user explicitly requests a different merge method.",
    ),
  reviewers: z
    .array(z.string())
    .optional()
    .describe("GitHub usernames to request as reviewers"),
  commentBody: z
    .string()
    .optional()
    .describe("Comment text (required for comment action)"),
  commentPath: z
    .string()
    .optional()
    .describe("File path for inline review comments"),
  commentLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Line number for inline review comments"),
  commentSide: z
    .enum(["LEFT", "RIGHT"])
    .optional()
    .describe("Diff side for inline comments (defaults to RIGHT)"),
  commitId: z
    .string()
    .optional()
    .describe("Commit SHA for inline review comments"),
});

export type GitHubPullRequestsInput = z.infer<
  typeof GitHubPullRequestsInputSchema
>;

/**
 * Schema for GitHub Issues operations.
 * Supports listing, getting, creating, updating, closing, and adding issues to projects.
 */
export const GitHubIssuesInputSchema = z.object({
  action: z
    .enum(["list", "get", "create", "update", "close", "add_to_project"])
    .describe("The operation to perform on issues"),
  owner: z
    .string()
    .optional()
    .describe(
      "Override for the repository owner. Already configured via environment. Only provide if the user explicitly specifies a different owner.",
    ),
  repo: z
    .string()
    .describe("The repository name. Required for all issue operations."),
  issueNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Issue number (required for get, update, close, and add_to_project)",
    ),
  title: z.string().optional().describe("Issue title (required for create)"),
  body: z.string().optional().describe("Issue body or description"),
  labels: z
    .array(z.string())
    .optional()
    .describe("Labels to apply to the issue"),
  assignee: z
    .string()
    .optional()
    .describe("GitHub username to assign the issue to"),
  state: z
    .enum(["open", "closed"])
    .optional()
    .describe("Issue state filter for list, or target state for update"),
  projectNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Project number to add the issue to (required for add_to_project)",
    ),
  status: z
    .string()
    .optional()
    .describe(
      "Status to set when adding to project (e.g., 'In Progress', 'Backlog')",
    ),
  iteration: z
    .string()
    .optional()
    .describe(
      "Iteration to set when adding to project (e.g., 'current', 'Iteration 1')",
    ),
  priority: z
    .string()
    .optional()
    .describe("Priority to set when adding to project (e.g., 'P0', 'P1', 'P2')"),
});

export type GitHubIssuesInput = z.infer<typeof GitHubIssuesInputSchema>;

/**
 * Schema for generating pseudo-llms.txt from a GitHub repository.
 */
export const GeneratePseudoLlmsTxtInputSchema = z.object({
  repo: z
    .string()
    .url()
    .describe(
      "Full GitHub repository URL (e.g. https://github.com/owner/repo)",
    ),
});

export type GeneratePseudoLlmsTxtInput = z.infer<
  typeof GeneratePseudoLlmsTxtInputSchema
>;
