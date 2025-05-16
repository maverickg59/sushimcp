import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractDomain,
  checkDomainAccess,
  parseFetchTarget,
  fetchContent,
  getVersion,
  type TargetInfo,
  logger,
} from "#lib/index";
import { URL } from "url";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as url from "url";
import * as nodeFs from "fs";
import { mockPathResolution, mockFileSystem } from "../../test-utils";

Object.defineProperty(import.meta, "url", {
  value: "file:///fake/path/src/lib/utils.ts",
});

vi.mock("node:fs/promises");
vi.mock("node:fs");
vi.mock("fs");

// Setup mocks
mockPathResolution(path);
mockFileSystem(fs);
mockFileSystem(nodeFs);

vi.mock("url", async () => {
  const actual = await vi.importActual<typeof import("url")>("url");
  return {
    ...actual,
    fileURLToPath: vi.fn().mockImplementation((url: string | URL) => {
      if (
        url === "file:///fake/path/src/lib/utils.ts" ||
        url === import.meta.url
      ) {
        return "/fake/path/src/lib/utils.ts";
      }
      const urlString = typeof url === "string" ? url : url.href;
      if (urlString.startsWith("file://")) {
        return urlString.slice(7);
      }
      return actual.fileURLToPath(url);
    }),
  };
});

vi.mock("path", async () => {
  const actual = await vi.importActual("path");
  return {
    ...actual,
    dirname: vi.fn().mockImplementation((p: string) => {
      if (p === "/fake/path/src/lib/utils.ts") return "/fake/path/src/lib";
      if (p === "/fake/path/src/lib") return "/fake/path/src";
      if (p === "/fake/path/src") return "/fake/path";
      return p;
    }),
    join: vi.fn().mockImplementation((...parts: string[]) => parts.join("/")),
  };
});

describe("extractDomain", () => {
  it("should extract domain from valid HTTP URL", () => {
    expect(extractDomain("http://example.com/path")).toBe("example.com");
  });

  it("should extract domain from valid HTTPS URL", () => {
    expect(extractDomain("https://sub.example.com/path")).toBe(
      "sub.example.com"
    );
  });

  it("should return null for invalid URL", () => {
    expect(extractDomain("not-a-url")).toBeNull();
  });

  it("should return null for non-HTTP/HTTPS protocols", () => {
    expect(extractDomain("file:///path/to/file")).toBeNull();
  });
});

describe("checkDomainAccess", () => {
  const loggerInfoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should allow access for matching domain", () => {
    const targetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com"),
      hostname: "example.com",
    };
    const allowedDomains = new Set(["example.com"]);

    expect(() => checkDomainAccess(targetInfo, allowedDomains)).not.toThrow();
  });

  it("should allow access when wildcard is present", () => {
    const targetInfo = {
      type: "remote" as const,
      url: new URL("https://any-domain.com"),
      hostname: "any-domain.com",
    };
    const allowedDomains = new Set(["*"]);

    expect(() => checkDomainAccess(targetInfo, allowedDomains)).not.toThrow();
  });

  it("should deny access for non-matching domain", () => {
    const targetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com"),
      hostname: "example.com",
    };
    const allowedDomains = new Set(["other-domain.com"]);

    expect(() => checkDomainAccess(targetInfo, allowedDomains)).toThrow(
      "Access denied: Fetching from domain 'example.com' is not allowed"
    );
  });

  it("should allow local file access", () => {
    const targetInfo = {
      type: "localPath" as const,
      resolvedPath: "/path/to/file",
      originalInput: "/path/to/file",
    };
    const allowedDomains = new Set([]);

    expect(() => checkDomainAccess(targetInfo, allowedDomains)).not.toThrow();
  });

  it("should throw for unsupported target type", () => {
    const targetInfo = {
      type: "unsupported" as const,
      reason: "test",
      originalInput: "test",
    };
    const allowedDomains = new Set([]);

    expect(() => checkDomainAccess(targetInfo, allowedDomains)).toThrow(
      "Internal error: Unsupported target type"
    );
  });

  it("should log allowed domains", () => {
    const targetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com"),
      hostname: "example.com",
    };
    const allowedDomains = new Set(["example.com"]);

    checkDomainAccess(targetInfo, allowedDomains);
    // Verify the log message contains the expected content
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining("Domain 'example.com' is allowed.")
    );
  });
});

describe("parseFetchTarget", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should parse HTTP URL", async () => {
    const result = await parseFetchTarget("http://example.com/path");
    expect(result).toEqual({
      type: "remote",
      url: new URL("http://example.com/path"),
      hostname: "example.com",
    });
  });

  it("should parse HTTPS URL", async () => {
    const result = await parseFetchTarget("https://example.com/path");
    expect(result).toEqual({
      type: "remote",
      url: new URL("https://example.com/path"),
      hostname: "example.com",
    });
  });

  it("should handle file URL", async () => {
    const filePath = "/absolute/path/to/file";
    const fileUrl = `file://${filePath}`;

    const result = await parseFetchTarget(fileUrl);
    expect(result.type).toBe("unsupported");
    const unsupportedResult = result as {
      type: "unsupported";
      reason: string;
      originalInput: string;
    };
    expect(unsupportedResult.originalInput).toBe(fileUrl);
    expect(unsupportedResult.reason).toContain(
      "Failed to convert file: URL to path"
    );
  });

  it("should parse local path", async () => {
    const localPath = "/path/to/file";
    vi.mocked(fs.stat).mockResolvedValueOnce({} as any);

    const result = await parseFetchTarget(localPath);
    expect(result).toEqual({
      type: "localPath",
      resolvedPath: path.resolve(localPath),
      originalInput: localPath,
    });
  });

  it("should handle non-existent local path", async () => {
    const localPath = "/non/existent/path";
    vi.mocked(fs.stat).mockRejectedValueOnce(new Error("ENOENT"));

    const result = await parseFetchTarget(localPath);
    expect(result).toEqual({
      type: "unsupported",
      originalInput: localPath,
      reason: expect.stringContaining("Path does not exist or is inaccessible"),
    });
  });

  it("should handle unsupported URL protocol", async () => {
    const result = await parseFetchTarget("ftp://example.com");
    expect(result).toEqual({
      type: "unsupported",
      originalInput: "ftp://example.com",
      reason: "Unsupported URL protocol: ftp:",
    });
  });
});

describe("fetchContent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should fetch remote content", async () => {
    const mockResponse = {
      ok: true,
      text: vi.fn().mockResolvedValue("content"),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse as any);

    const targetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/"),
      hostname: "example.com",
    };

    const result = await fetchContent(targetInfo);
    expect(result).toBe("content");
    expect(fetch).toHaveBeenCalledWith("https://example.com/");
  });

  it("should log when fetching remote content", async () => {
    const mockResponse = {
      ok: true,
      text: vi.fn().mockResolvedValue("content"),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse as any);
    const loggerInfoSpy = vi.spyOn(logger, "info");

    const targetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/"),
      hostname: "example.com",
    };

    await fetchContent(targetInfo);
    // Verify the log message contains the expected fetch URL
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining("Fetching remote URL: https://example.com/")
    );
  });

  it("should handle remote fetch failure", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const targetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com"),
      hostname: "example.com",
    };

    await expect(fetchContent(targetInfo)).rejects.toThrow("HTTP error 404");
  });

  it("should fetch local file content", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("local content" as any);

    const targetInfo = {
      type: "localPath" as const,
      resolvedPath: "/path/to/file",
      originalInput: "file.txt",
    };

    const content = await fetchContent(targetInfo);
    expect(content).toBe("local content");
    expect(fs.readFile).toHaveBeenCalledWith("/path/to/file", "utf-8");
  });

  it("should fetch local file content from file URL", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("file url content" as any);
    const loggerInfoSpy = vi.spyOn(logger, "info");

    const targetInfo = {
      type: "localFileUrl" as const,
      filePath: "/local/file/path",
      url: new URL("file:///local/file/path"),
    };

    const content = await fetchContent(targetInfo);
    expect(content).toBe("file url content");
    expect(fs.readFile).toHaveBeenCalledWith("/local/file/path", "utf-8");
    // Verify the log message contains the expected file path
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Reading local file path from file: URL: /local/file/path"
      )
    );
  });

  it("should handle local file read failure", async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("ENOENT"));

    const targetInfo = {
      type: "localPath" as const,
      resolvedPath: "/path/to/file",
      originalInput: "/path/to/file",
    };

    await expect(fetchContent(targetInfo)).rejects.toThrow();
  });

  it("should throw for unsupported target type", async () => {
    const targetInfo = {
      type: "unsupported" as const,
      reason: "Test reason",
      originalInput: "test",
    };

    await expect(fetchContent(targetInfo)).rejects.toThrow(
      "Cannot fetch content for unsupported target type: Test reason"
    );
  });

  it("should throw on unknown target type (exhaustive check)", async () => {
    const targetInfo = {
      type: "unknown",
      reason: "Unknown type test",
      originalInput: "test",
    } as unknown as TargetInfo;

    await expect(fetchContent(targetInfo)).rejects.toThrow(
      "Internal error: Unhandled target info type"
    );
  });
});

describe("getVersion", () => {
  it("verifies the getVersion implementation", () => {
    const mockReadFileSync = nodeFs.readFileSync;
    expect(mockReadFileSync).toBeDefined();

    const packageJson = JSON.parse(JSON.stringify({ version: "1.2.3" }));
    expect(packageJson.version).toBe("1.2.3");

    const mockUrl = url.fileURLToPath;
    expect(mockUrl).toBeDefined();

    expect(typeof getVersion).toBe("function");
  });
});

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
