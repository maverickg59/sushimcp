import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetch_llms_txt } from "#tools/fetch_llms_txt";
import * as utils from "#lib/utils";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import {
  consoleErrorSpy,
  consoleInfoSpy,
  resetAllMocks,
} from "../../test-utils";

vi.mock("#lib/utils", async () => {
  const actual = await vi.importActual("#lib/utils");
  return {
    ...actual,
    parseFetchTarget: vi.fn(),
    fetchContent: vi.fn(),
    checkDomainAccess: vi.fn(),
  };
});

describe("fetch_llms_txt", () => {
  const mockExtra = {} as RequestHandlerExtra<
    ServerRequest,
    ServerNotification
  >;
  const mockAllowedDomains = new Set(["example.com", "docs.example.org"]);

  const originalEnv = process.env;

  beforeEach(() => {
    resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should handle a single URL in object format", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/llms.txt"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockResolvedValueOnce(
      "Content from llms.txt"
    );

    const result = await fetch_llms_txt(
      { url: "https://example.com/llms.txt" },
      mockExtra,
      mockAllowedDomains
    );

    expect(utils.parseFetchTarget).toHaveBeenCalledWith(
      "https://example.com/llms.txt"
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "Processing fetch_llms_txt request with params:",
      { url: "https://example.com/llms.txt" }
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "Fetching llms.txt from https://example.com/llms.txt"
    );
    expect(utils.checkDomainAccess).toHaveBeenCalledWith(
      mockTargetInfo,
      mockAllowedDomains
    );
    expect(utils.fetchContent).toHaveBeenCalledWith(mockTargetInfo);

    expect(result).toEqual({
      content: [{ type: "text", text: "Content from llms.txt" }],
    });
  });

  it("should handle an array of URLs", async () => {
    // Setup mocks for first URL
    const mockTargetInfo1 = {
      type: "remote" as const,
      url: new URL("https://example.com/llms.txt"),
      hostname: "example.com",
    };

    // Setup mocks for second URL
    const mockTargetInfo2 = {
      type: "remote" as const,
      url: new URL("https://docs.example.org/llms.txt"),
      hostname: "docs.example.org",
    };

    vi.mocked(utils.parseFetchTarget)
      .mockResolvedValueOnce(mockTargetInfo1)
      .mockResolvedValueOnce(mockTargetInfo2);

    vi.mocked(utils.fetchContent)
      .mockResolvedValueOnce("Content from first source")
      .mockResolvedValueOnce("Content from second source");

    // Call function with array input
    const result = await fetch_llms_txt(
      ["https://example.com/llms.txt", "https://docs.example.org/llms.txt"],
      mockExtra,
      mockAllowedDomains
    );

    // Verify results
    expect(utils.parseFetchTarget).toHaveBeenCalledTimes(2);
    expect(utils.checkDomainAccess).toHaveBeenCalledTimes(2);
    expect(utils.fetchContent).toHaveBeenCalledTimes(2);

    expect(result).toEqual({
      content: [
        { type: "text", text: "Content from first source" },
        { type: "text", text: "Content from second source" },
      ],
    });
  });

  it("should log when fetching llms.txt", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/llms.txt"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockResolvedValueOnce("Test content");

    await fetch_llms_txt(
      { url: "https://example.com/llms.txt" },
      mockExtra,
      mockAllowedDomains
    );

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining("Processing fetch_llms_txt request with params:"),
      expect.anything()
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Fetching llms.txt from https://example.com/llms.txt"
      )
    );
  });

  it("should throw error for unsupported targets", async () => {
    const unsupportedTarget = {
      type: "unsupported" as const,
      reason: "Invalid protocol",
      originalInput: "ftp://example.com/llms.txt",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(unsupportedTarget);

    await expect(
      fetch_llms_txt(
        { url: "ftp://example.com/llms.txt" },
        mockExtra,
        mockAllowedDomains
      )
    ).rejects.toThrow("For URL ftp://example.com/llms.txt: Invalid protocol");
  });

  it("should handle domain access check failures", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://untrusted.example/llms.txt"),
      hostname: "untrusted.example",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.checkDomainAccess).mockImplementationOnce(() => {
      throw new Error(
        "Access denied: Domain 'untrusted.example' is not allowed"
      );
    });

    await expect(
      fetch_llms_txt(
        { url: "https://untrusted.example/llms.txt" },
        mockExtra,
        mockAllowedDomains
      )
    ).rejects.toThrow("Failed to process fetch request: Access denied");

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("should handle content fetch failures", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/not-found.txt"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockRejectedValueOnce(
      new Error("HTTP error 404")
    );

    await expect(
      fetch_llms_txt(
        { url: "https://example.com/not-found.txt" },
        mockExtra,
        mockAllowedDomains
      )
    ).rejects.toThrow("Failed to process fetch request: HTTP error 404");

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
