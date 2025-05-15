import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetch_openapi_spec } from "#tools/fetch_openapi_spec";
import * as utils from "#lib/utils";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";

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
  const mockConsoleInfo = vi
    .spyOn(console, "info")
    .mockImplementation(() => {});
  const mockConsoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => {});

  const mockExtra = {} as RequestHandlerExtra<
    ServerRequest,
    ServerNotification
  >;
  const mockAllowedDomains = new Set(["example.com", "api.example.org"]);

  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    process.env.MCP_STDIO_MODE = "silent";
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

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockResolvedValueOnce(
      '{"openapi":"3.0.0","info":{"title":"Test API"}}'
    );

    const result = await fetch_openapi_spec(
      { url: "https://example.com/openapi.json" },
      mockExtra,
      mockAllowedDomains
    );

    expect(utils.parseFetchTarget).toHaveBeenCalledWith(
      "https://example.com/openapi.json"
    );
    expect(utils.checkDomainAccess).toHaveBeenCalledWith(
      mockTargetInfo,
      mockAllowedDomains
    );
    expect(utils.fetchContent).toHaveBeenCalledWith(mockTargetInfo);

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: '{"openapi":"3.0.0","info":{"title":"Test API"}}',
        },
      ],
    });
  });

  it("should handle an array of URLs", async () => {
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

    vi.mocked(utils.parseFetchTarget)
      .mockResolvedValueOnce(mockTargetInfo1)
      .mockResolvedValueOnce(mockTargetInfo2);

    vi.mocked(utils.fetchContent)
      .mockResolvedValueOnce('{"openapi":"3.0.0","info":{"title":"First API"}}')
      .mockResolvedValueOnce(
        '{"openapi":"3.0.0","info":{"title":"Second API"}}'
      );

    const result = await fetch_openapi_spec(
      [
        "https://example.com/openapi.json",
        "https://api.example.org/openapi.json",
      ],
      mockExtra,
      mockAllowedDomains
    );

    expect(utils.parseFetchTarget).toHaveBeenCalledTimes(2);
    expect(utils.checkDomainAccess).toHaveBeenCalledTimes(2);
    expect(utils.fetchContent).toHaveBeenCalledTimes(2);

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: '{"openapi":"3.0.0","info":{"title":"First API"}}',
        },
        {
          type: "text",
          text: '{"openapi":"3.0.0","info":{"title":"Second API"}}',
        },
      ],
    });
  });

  it("should log to console when MCP_STDIO_MODE is not silent", async () => {
    process.env.MCP_STDIO_MODE = "verbose";

    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/openapi.json"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockResolvedValueOnce('{"openapi":"3.0.0"}');

    await fetch_openapi_spec(
      { url: "https://example.com/openapi.json" },
      mockExtra,
      mockAllowedDomains
    );

    expect(mockConsoleInfo).toHaveBeenCalledWith(
      expect.stringContaining(
        "Processing fetch_openapi_spec request with params:"
      ),
      expect.anything()
    );
    expect(mockConsoleInfo).toHaveBeenCalledWith(
      expect.stringContaining(
        "Fetching OpenAPI spec from https://example.com/openapi.json"
      )
    );
  });

  it("should throw error for unsupported targets", async () => {
    const unsupportedTarget = {
      type: "unsupported" as const,
      reason: "Invalid protocol",
      originalInput: "ftp://example.com/openapi.json",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(unsupportedTarget);

    await expect(
      fetch_openapi_spec(
        { url: "ftp://example.com/openapi.json" },
        mockExtra,
        mockAllowedDomains
      )
    ).rejects.toThrow(
      "For URL ftp://example.com/openapi.json: Invalid protocol"
    );
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
    ).rejects.toThrow("Failed to process fetch request: Access denied");

    expect(mockConsoleError).toHaveBeenCalled();
  });

  it("should handle content fetch failures", async () => {
    const mockTargetInfo = {
      type: "remote" as const,
      url: new URL("https://example.com/not-found.json"),
      hostname: "example.com",
    };

    vi.mocked(utils.parseFetchTarget).mockResolvedValueOnce(mockTargetInfo);
    vi.mocked(utils.fetchContent).mockRejectedValueOnce(
      new Error("HTTP error 404")
    );

    await expect(
      fetch_openapi_spec(
        { url: "https://example.com/not-found.json" },
        mockExtra,
        mockAllowedDomains
      )
    ).rejects.toThrow("Failed to process fetch request: HTTP error 404");

    expect(mockConsoleError).toHaveBeenCalled();
  });
});
