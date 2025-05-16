import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetch_openapi_spec } from "#tools/fetch_openapi_spec";
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

describe("fetch_openapi_spec", () => {
  const mockExtra = {} as RequestHandlerExtra<
    ServerRequest,
    ServerNotification
  >;
  const mockAllowedDomains = new Set(["example.com", "api.example.org"]);

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
      url: new URL("https://example.com/openapi.json"),
      hostname: "example.com",
    };

    const mockApiSpec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Test API" },
    });

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockResolvedValueOnce(mockApiSpec);

    // Mock the logger
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const result = await fetch_openapi_spec(
      { url: "https://example.com/openapi.json" },
      mockExtra,
      mockAllowedDomains
    );

    expect(utils.parseFetchTarget).toHaveBeenCalledWith(
      "https://example.com/openapi.json"
    );

    // Verify debug logs were called with expected messages
    const debugCalls = debugSpy.mock.calls.flat();
    expect(
      debugCalls.some(
        (call) =>
          typeof call === "string" &&
          call.includes("Processing fetch_openapi_spec request with input:")
      )
    ).toBe(true);

    expect(utils.checkDomainAccess).toHaveBeenCalledWith(
      mockTargetInfo,
      mockAllowedDomains
    );
    expect(utils.fetchContent).toHaveBeenCalledWith(mockTargetInfo);

    expect(result).toEqual({
      content: [
        { type: "text", text: mockApiSpec },
      ],
    });

    debugSpy.mockRestore();
  });

  it("should handle an array of URLs", async () => {
    // Setup mocks for first URL
    const mockTargetInfo1 = {
      type: "remote" as const,
      url: new URL("https://example.com/openapi.json"),
      hostname: "example.com",
    };

    // Setup mocks for second URL
    const mockTargetInfo2 = {
      type: "remote" as const,
      url: new URL("https://api.example.org/openapi.json"),
      hostname: "api.example.org",
    };

    const mockApiSpec1 = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "API 1" },
    });
    const mockApiSpec2 = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "API 2" },
    });

    vi.mocked(utils.parseFetchTarget)
      .mockResolvedValueOnce(mockTargetInfo1)
      .mockResolvedValueOnce(mockTargetInfo2);

    vi.mocked(utils.checkDomainAccess)
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => Promise.resolve());

    vi.mocked(utils.fetchContent)
      .mockResolvedValueOnce(mockApiSpec1)
      .mockResolvedValueOnce(mockApiSpec2);

    // Mock the logger
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    // Call function with array input
    const result = await fetch_openapi_spec(
      ["https://example.com/openapi.json", "https://api.example.org/openapi.json"],
      mockExtra,
      mockAllowedDomains
    );

    // Verify results
    expect(utils.parseFetchTarget).toHaveBeenCalledTimes(2);
    expect(utils.fetchContent).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      content: [
        { type: "text", text: mockApiSpec1 },
        { type: "text", text: mockApiSpec2 },
      ],
    });

    // Verify debug logs were called with expected messages
    const debugCalls = debugSpy.mock.calls.flat();
    expect(
      debugCalls.some(
        (call) =>
          typeof call === "string" &&
          call.includes("Processing fetch_openapi_spec request with input:")
      )
    ).toBe(true);

    debugSpy.mockRestore();
  });

  it("should log when fetching OpenAPI spec", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/openapi.json"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockResolvedValueOnce(
      JSON.stringify({ openapi: "3.0.0", info: { title: "Test API" } })
    );

    // Mock the logger
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    await fetch_openapi_spec(
      { url: "https://example.com/openapi.json" },
      mockExtra,
      mockAllowedDomains
    );

    // Verify debug logs were called with expected messages
    const debugCalls = debugSpy.mock.calls.flat();
    expect(
      debugCalls.some(
        (call) =>
          typeof call === "string" &&
          call.includes("Processing fetch_openapi_spec request with input:")
      )
    ).toBe(true);

    debugSpy.mockRestore();
  });

  it("should throw error for unsupported targets", async () => {
    const unsupportedTarget = {
      type: "unsupported" as const,
      reason: "Invalid protocol",
      originalInput: "ftp://example.com/openapi.json",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(unsupportedTarget);

    const error = await fetch_openapi_spec(
      { url: "ftp://example.com/openapi.json" },
      mockExtra,
      mockAllowedDomains
    ).catch((err) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(
      "Failed to process OpenAPI spec request for ftp://example.com/openapi.json"
    );
    expect(error.message).toContain("Unsupported URL format: Invalid protocol");
  });

  it("should handle domain access check failures", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://untrusted.example/openapi.json"),
      hostname: "untrusted.example",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.checkDomainAccess).mockImplementationOnce(() => {
      throw new Error(
        "Access denied: Domain 'untrusted.example' is not allowed"
      );
    });

    await expect(
      fetch_openapi_spec(
        { url: "https://untrusted.example/openapi.json" },
        mockExtra,
        mockAllowedDomains
      )
    ).rejects.toThrow(
      "Failed to process OpenAPI spec request for https://untrusted.example/openapi.json"
    );
  });

  it("should handle content fetch failures", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/not-found.json"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockRejectedValueOnce(new Error("Not Found"));

    await expect(
      fetch_openapi_spec(
        { url: "https://example.com/not-found.json" },
        mockExtra,
        mockAllowedDomains
      )
    ).rejects.toThrow(
      "Failed to process OpenAPI spec request for https://example.com/not-found.json"
    );
  });

  it("should handle failed content fetch with generic error message", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/error.json"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockRejectedValueOnce(new Error());

    await expect(
      fetch_openapi_spec(
        { url: "https://example.com/error.json" },
        mockExtra,
        mockAllowedDomains
      )
    ).rejects.toThrow(
      "Failed to process OpenAPI spec request for https://example.com/error.json"
    );
  });

  it("should handle string URL input format", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/openapi.json"),
      hostname: "example.com",
    };

    const mockApiSpec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Test API" },
    });

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockResolvedValueOnce(mockApiSpec);

    const result = await fetch_openapi_spec(
      "https://example.com/openapi.json",
      mockExtra,
      mockAllowedDomains
    );

    expect(utils.parseFetchTarget).toHaveBeenCalledWith(
      "https://example.com/openapi.json"
    );

    expect(result).toEqual({
      content: [{ type: "text", text: mockApiSpec }],
    });
  });

  it("should handle array of string URLs input format", async () => {
    const mockTargetInfo1 = {
      type: "remote" as const,
      url: new URL("https://example.com/openapi.json"),
      hostname: "example.com",
    };

    const mockTargetInfo2 = {
      type: "remote" as const,
      url: new URL("https://api.example.org/openapi.json"),
      hostname: "api.example.org",
    };

    const mockApiSpec1 = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "API 1" },
    });
    const mockApiSpec2 = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "API 2" },
    });

    vi.mocked(utils.parseFetchTarget)
      .mockResolvedValueOnce(mockTargetInfo1)
      .mockResolvedValueOnce(mockTargetInfo2);

    vi.mocked(utils.fetchContent)
      .mockResolvedValueOnce(mockApiSpec1)
      .mockResolvedValueOnce(mockApiSpec2);

    const result = await fetch_openapi_spec(
      [
        "https://example.com/openapi.json",
        "https://api.example.org/openapi.json",
      ],
      mockExtra,
      mockAllowedDomains
    );

    expect(utils.parseFetchTarget).toHaveBeenCalledTimes(2);
    expect(utils.fetchContent).toHaveBeenCalledTimes(2);

    expect(result).toEqual({
      content: [
        { type: "text", text: mockApiSpec1 },
        { type: "text", text: mockApiSpec2 },
      ],
    });
  });

  it("should handle error in URL processing", async () => {
    const error = new Error("Invalid URL");
    vi.mocked(utils.parseFetchTarget).mockRejectedValueOnce(error);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const errorResult = await fetch_openapi_spec(
      { url: "invalid-url" },
      mockExtra,
      mockAllowedDomains
    ).catch((err) => err);

    expect(errorResult).toBeInstanceOf(Error);
    expect(errorResult.message).toContain(
      "Failed to process OpenAPI spec request for invalid-url"
    );

    errorSpy.mockRestore();
  });
});
