import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetch_llms_txt } from "#tools/fetch_llms_txt";
import * as utils from "#lib/utils";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { resetAllMocks } from "../../test-utils";

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

    // Mock the logger
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const result = await fetch_llms_txt(
      { url: "https://example.com/llms.txt" },
      mockExtra,
      mockAllowedDomains
    );

    expect(utils.parseFetchTarget).toHaveBeenCalledWith(
      "https://example.com/llms.txt"
    );

    // Verify debug logs were called with expected messages
    const debugCalls = debugSpy.mock.calls.flat();
    expect(
      debugCalls.some(
        (call) =>
          typeof call === "string" &&
          call.includes("Processing fetch_llms_txt request with input:")
      )
    ).toBe(true);

    expect(utils.checkDomainAccess).toHaveBeenCalledWith(
      mockTargetInfo,
      mockAllowedDomains
    );
    expect(utils.fetchContent).toHaveBeenCalledWith(mockTargetInfo);

    expect(result).toEqual({
      content: [{ type: "text", text: "Content from llms.txt" }],
    });

    debugSpy.mockRestore();
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

    vi.mocked(utils.checkDomainAccess)
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => Promise.resolve());

    vi.mocked(utils.fetchContent)
      .mockResolvedValueOnce("Content from first source")
      .mockResolvedValueOnce("Content from second source");

    // Mock the logger
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    // Call function with array input
    const result = await fetch_llms_txt(
      ["https://example.com/llms.txt", "https://docs.example.org/llms.txt"],
      mockExtra,
      mockAllowedDomains
    );

    // Verify results
    expect(utils.parseFetchTarget).toHaveBeenCalledTimes(2);
    expect(utils.fetchContent).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      content: [
        { type: "text", text: "Content from first source" },
        { type: "text", text: "Content from second source" },
      ],
    });

    // Verify debug logs were called with expected messages
    const debugCalls = debugSpy.mock.calls.flat();
    expect(
      debugCalls.some(
        (call) =>
          typeof call === "string" &&
          call.includes("Processing fetch_llms_txt request with input:")
      )
    ).toBe(true);

    debugSpy.mockRestore();
  });

  it("should log when fetching llms.txt", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/llms.txt"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockResolvedValueOnce("Test content");

    // Mock the logger
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    await fetch_llms_txt(
      { url: "https://example.com/llms.txt" },
      mockExtra,
      mockAllowedDomains
    );

    // Verify debug logs were called with expected messages
    const debugCalls = debugSpy.mock.calls.flat();
    expect(
      debugCalls.some(
        (call) =>
          typeof call === "string" &&
          call.includes("Processing fetch_llms_txt request with input:")
      )
    ).toBe(true);

    debugSpy.mockRestore();
  });

  it("should throw error for unsupported targets", async () => {
    const unsupportedTarget = {
      type: "unsupported" as const,
      reason: "Invalid protocol",
      originalInput: "ftp://example.com/llms.txt",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(unsupportedTarget);

    const error = await fetch_llms_txt(
      { url: "ftp://example.com/llms.txt" },
      mockExtra,
      mockAllowedDomains
    ).catch((err) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(
      "Failed to process fetch request for ftp://example.com/llms.txt"
    );
    expect(error.message).toContain("Unsupported URL format: Invalid protocol");
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

    const error = await fetch_llms_txt(
      { url: "https://untrusted.example/llms.txt" },
      mockExtra,
      mockAllowedDomains
    ).catch((err) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(
      "Failed to process fetch request for https://untrusted.example/llms.txt"
    );
    expect(error.message).toContain(
      "Access denied: Domain 'untrusted.example' is not allowed"
    );
  });

  it("should handle content fetch failures", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/not-found.txt"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockRejectedValueOnce(new Error("Not Found"));

    const error = await fetch_llms_txt(
      { url: "https://example.com/not-found.txt" },
      mockExtra,
      mockAllowedDomains
    ).catch((err) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(
      "Failed to process fetch request for https://example.com/not-found.txt"
    );
    expect(error.message).toContain("Not Found");
  });

  it("should handle fetch content error with no message", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/error.txt"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockRejectedValueOnce(new Error());

    const error = await fetch_llms_txt(
      { url: "https://example.com/error.txt" },
      mockExtra,
      mockAllowedDomains
    ).catch((err) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(
      "Failed to process fetch request for https://example.com/error.txt"
    );
  });

  it("should handle string URL input format", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/llms.txt"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockResolvedValueOnce(
      "Content from string URL"
    );

    const result = await fetch_llms_txt(
      "https://example.com/llms.txt",
      mockExtra,
      mockAllowedDomains
    );

    expect(utils.parseFetchTarget).toHaveBeenCalledWith(
      "https://example.com/llms.txt"
    );
    expect(result).toEqual({
      content: [{ type: "text", text: "Content from string URL" }],
    });
  });

  it("should handle array of string URLs input format", async () => {
    const mockTargetInfo1 = {
      type: "remote" as const,
      url: new URL("https://example.com/llms.txt"),
      hostname: "example.com",
    };
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

    const result = await fetch_llms_txt(
      ["https://example.com/llms.txt", "https://docs.example.org/llms.txt"],
      mockExtra,
      mockAllowedDomains
    );

    expect(utils.parseFetchTarget).toHaveBeenCalledTimes(2);
    expect(utils.fetchContent).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      content: [
        { type: "text", text: "Content from first source" },
        { type: "text", text: "Content from second source" },
      ],
    });
  });

  it("should handle error in URL processing", async () => {
    vi.mocked(utils.parseFetchTarget).mockRejectedValueOnce(
      new Error("Invalid URL")
    );

    const error = await fetch_llms_txt(
      { url: "invalid-url" },
      mockExtra,
      mockAllowedDomains
    ).catch((err) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(
      "Failed to process fetch request for invalid-url"
    );
    expect(error.message).toContain("Invalid URL");
  });

  it("should handle string URL input format", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/llms.txt"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockResolvedValueOnce(
      "Content from string URL"
    );

    const result = await fetch_llms_txt(
      "https://example.com/llms.txt", // String URL input
      mockExtra,
      mockAllowedDomains
    );

    expect(utils.parseFetchTarget).toHaveBeenCalledWith(
      "https://example.com/llms.txt"
    );
    expect(utils.checkDomainAccess).toHaveBeenCalledWith(
      mockTargetInfo,
      mockAllowedDomains
    );
    expect(utils.fetchContent).toHaveBeenCalledWith(mockTargetInfo);
    expect(result).toEqual({
      content: [{ type: "text", text: "Content from string URL" }],
    });
  });

  it("should handle fetch content error", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/llms.txt"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockRejectedValueOnce(
      new Error("Network error")
    );

    // Mock the logger
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      fetch_llms_txt(
        { url: "https://example.com/llms.txt" },
        mockExtra,
        mockAllowedDomains
      )
    ).rejects.toThrow(
      "Failed to process fetch request for https://example.com/llms.txt: Network error"
    );

    // Verify error was logged
    const errorCalls = errorSpy.mock.calls.flat();
    expect(
      errorCalls.some(
        (call) =>
          typeof call === "string" &&
          call.includes(
            "Failed to process fetch request for https://example.com/llms.txt"
          )
      )
    ).toBe(true);

    errorSpy.mockRestore();
  });

  it("should handle mixed array of string and object URLs", async () => {
    const mockTarget1 = {
      type: "remote" as const,
      url: new URL("https://example.com/llms.txt"),
      hostname: "example.com",
    };
    const mockTarget2 = {
      type: "remote" as const,
      url: new URL("https://docs.example.org/llms.txt"),
      hostname: "docs.example.org",
    };

    // Mock parseFetchTarget to handle both URLs
    vi.mocked(utils.parseFetchTarget)
      .mockResolvedValueOnce(mockTarget1)  // For string URL
      .mockResolvedValueOnce(mockTarget2); // For object URL

    // Mock fetchContent for both URLs
    vi.mocked(utils.fetchContent)
      .mockResolvedValueOnce("Content from string URL")
      .mockResolvedValueOnce("Content from object URL");

    // Call with mixed array: one string, one object
    const result = await fetch_llms_txt(
      [
        "https://example.com/llms.txt",  // string
        { url: "https://docs.example.org/llms.txt" }  // object
      ],
      mockExtra,
      mockAllowedDomains
    );

    // Verify both URLs were processed
    expect(utils.parseFetchTarget).toHaveBeenCalledTimes(2);
    expect(utils.parseFetchTarget).toHaveBeenCalledWith("https://example.com/llms.txt");
    expect(utils.parseFetchTarget).toHaveBeenCalledWith("https://docs.example.org/llms.txt");
    
    // Verify both fetchContent calls were made
    expect(utils.fetchContent).toHaveBeenCalledTimes(2);
    
    // Verify the results
    expect(result).toEqual({
      content: [
        { type: "text", text: "Content from string URL" },
        { type: "text", text: "Content from object URL" }
      ]
    });
  });

  it("should handle fetch content error with network error", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/llms.txt"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockRejectedValueOnce(
      new Error("Network error")
    );

    // Mock the logger
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      fetch_llms_txt(
        { url: "https://example.com/llms.txt" },
        mockExtra,
        mockAllowedDomains
      )
    ).rejects.toThrow(
      "Failed to process fetch request for https://example.com/llms.txt: Network error"
    );

    // Verify error was logged
    const errorCalls = errorSpy.mock.calls.flat();
    expect(
      errorCalls.some(
        (call) =>
          typeof call === "string" &&
          call.includes(
            "Failed to process fetch request for https://example.com/llms.txt"
          )
      )
    ).toBe(true);

    errorSpy.mockRestore();
  });
});
