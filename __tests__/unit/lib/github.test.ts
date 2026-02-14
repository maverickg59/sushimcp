import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getGitHubConfig,
  getDefaultBranch,
  githubGraphQL,
  githubRest,
} from "#lib/github";
import { resetAllMocks } from "../../test-utils.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("GitHub Client", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetAllMocks();
    process.env = {
      ...originalEnv,
      GITHUB_PROXY_URL: "http://localhost:4111",
      GITHUB_PROXY_KEY: "test-proxy-key",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getGitHubConfig", () => {
    it("should return sensible defaults when only proxy vars are set", () => {
      const config = getGitHubConfig();
      expect(config.defaultOwner).toBeUndefined();
      expect(config.defaultOrg).toBeUndefined();
      expect(config.defaultMergeMethod).toBe("merge");
    });

    it("should read all optional env vars", () => {
      process.env.GITHUB_OWNER = "my-user";
      process.env.GITHUB_ORG = "my-org";
      process.env.GITHUB_MERGE_METHOD = "rebase";

      const config = getGitHubConfig();
      expect(config.defaultOwner).toBe("my-user");
      expect(config.defaultOrg).toBe("my-org");
      expect(config.defaultMergeMethod).toBe("rebase");
    });

    it("should fall back to merge for invalid GITHUB_MERGE_METHOD", () => {
      process.env.GITHUB_MERGE_METHOD = "invalid-method";
      const config = getGitHubConfig();
      expect(config.defaultMergeMethod).toBe("merge");
    });
  });

  describe("getDefaultBranch", () => {
    it("should fetch the default branch from the repo API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ default_branch: "develop" }),
      });

      const branch = await getDefaultBranch("testowner", "testrepo");
      expect(branch).toBe("develop");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:4111/rest/repos/testowner/testrepo",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should propagate errors from the REST call", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      });

      await expect(
        getDefaultBranch("testowner", "nonexistent"),
      ).rejects.toThrow("failed with status 404");
    });
  });

  describe("githubGraphQL", () => {
    it("should send a GraphQL request through the proxy and return data", async () => {
      const mockData = { user: { projectV2: { id: "PVT_123" } } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockData }),
      });

      const result = await githubGraphQL(
        "query { user { projectV2 { id } } }",
        { login: "testuser" },
      );

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:4111/graphql",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-proxy-key": "test-proxy-key",
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("should throw on HTTP error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      await expect(githubGraphQL("query { viewer { login } }")).rejects.toThrow(
        "GitHub GraphQL request failed with status 401",
      );
    });

    it("should throw on GraphQL errors in response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: "Field not found" }],
        }),
      });

      await expect(githubGraphQL("query { invalid }")).rejects.toThrow(
        "GitHub GraphQL errors: Field not found",
      );
    });

    it("should throw when response contains no data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(githubGraphQL("query { viewer { login } }")).rejects.toThrow(
        "GitHub GraphQL response contained no data",
      );
    });

    it("should throw when proxy is not configured", async () => {
      delete process.env.GITHUB_PROXY_URL;
      delete process.env.GITHUB_PROXY_KEY;

      await expect(githubGraphQL("query { viewer { login } }")).rejects.toThrow(
        "GitHub proxy is not configured",
      );
    });
  });

  describe("githubRest", () => {
    it("should send a GET request through the proxy and return JSON", async () => {
      const mockData = [{ number: 1, title: "Test PR" }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      });

      const result = await githubRest("GET", "/repos/owner/repo/pulls");

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:4111/rest/repos/owner/repo/pulls",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "x-proxy-key": "test-proxy-key",
            Accept: "application/json",
          }),
          body: undefined,
        }),
      );
    });

    it("should send a POST request with body through the proxy", async () => {
      const mockData = { number: 42, html_url: "https://github.com/pr/42" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockData,
      });

      const result = await githubRest("POST", "/repos/owner/repo/pulls", {
        title: "New PR",
        body: "Description",
        head: "feature",
        base: "main",
      });

      expect(result).toEqual(mockData);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe(
        "http://localhost:4111/rest/repos/owner/repo/pulls",
      );
      expect(JSON.parse(callArgs[1].body)).toEqual({
        title: "New PR",
        body: "Description",
        head: "feature",
        base: "main",
      });
      expect(callArgs[1].headers["x-proxy-key"]).toBe("test-proxy-key");
    });

    it("should return empty object for 204 No Content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await githubRest("DELETE", "/repos/owner/repo/pulls/1");
      expect(result).toEqual({});
    });

    it("should throw on HTTP error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      });

      await expect(
        githubRest("GET", "/repos/owner/nonexistent/pulls"),
      ).rejects.toThrow(
        "GitHub REST GET /repos/owner/nonexistent/pulls failed with status 404",
      );
    });

    it("should throw when proxy is not configured", async () => {
      delete process.env.GITHUB_PROXY_URL;
      delete process.env.GITHUB_PROXY_KEY;

      await expect(
        githubRest("GET", "/repos/owner/repo/pulls"),
      ).rejects.toThrow("GitHub proxy is not configured");
    });
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
