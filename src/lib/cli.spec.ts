import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as cliLib from "./cli_lib.js";

// Mock dependencies
vi.mock("node:fs");
vi.mock("node:path");
vi.mock("node:url");
vi.mock("./cli_lib.js");
vi.mock("./utils.js");

// Import the module containing the functions we want to test
import * as cliModule from "./cli.js";

describe("CLI Internal Functions", () => {
  // Setup spies for console methods
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => {});
  const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

  // Store original environment
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
    process.env = { ...originalEnv };

    // Setup common mocks
    vi.mocked(path.resolve).mockImplementation((...parts) => parts.join("/"));
    vi.mocked(path.join).mockImplementation((...parts) => parts.join("/"));
    vi.mocked(fileURLToPath).mockImplementation((url) => {
      if (typeof url === "string") return url.replace("file://", "");
      return "/mock/path";
    });

    // Mock the cli_lib functions
    vi.mocked(cliLib.parseNameValuePair).mockImplementation((input) => {
      if (input.includes(":")) {
        const [name, value] = input.split(":", 2);
        return { name, urlValue: value };
      }
      return null;
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetAllMocks();
  });

  describe("loadDefaultSources", () => {
    it("should load and parse default sources from file", () => {
      const mockFileContent =
        "- typescript:https://example.com/typescript\n- node:http://nodejs.org/docs";
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

      const result = cliModule.loadDefaultSources("/mock/defaults.txt");

      expect(result).toEqual({
        typescript: "https://example.com/typescript",
        node: "http://nodejs.org/docs",
      });
    });

    it("should handle errors when reading defaults file", () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("File not found");
      });

      const result = cliModule.loadDefaultSources("/nonexistent/file");

      expect(result).toEqual({});
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("processSourceOptions", () => {
    it("should process individual source options", () => {
      const sources = {};
      const singleOptions = [
        "node:https://example.com/node",
        "typescript:https://example.com/ts",
      ];

      const result = cliModule.processSourceOptions(
        sources,
        singleOptions,
        "--llms-txt-source",
        undefined,
        "--llms-txt-sources"
      );

      expect(result).toEqual({
        node: "https://example.com/node",
        typescript: "https://example.com/ts",
      });
    });

    it("should handle invalid source options", () => {
      const sources = {};
      const singleOptions = ["invalid-format"];

      const result = cliModule.processSourceOptions(
        sources,
        singleOptions,
        "--llms-txt-source",
        undefined,
        "--llms-txt-sources-file"
      );

      expect(result).toEqual({});
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("processDomainOptions", () => {
    it("should process individual domain options", () => {
      const allowDomainOptions = ["example.com", "test.org"];
      const docSources = {
        test: "https://example.com/docs",
      };
      const openApiSpecs = { test: "https://example.com/api/v1/openapi.json" };

      const result = cliModule.processDomainOptions(
        allowDomainOptions,
        undefined,
        docSources,
        openApiSpecs
      );

      expect(result).toEqual(new Set(["example.com", "test.org"]));
    });

    it("should handle wildcard domain option", () => {
      const allowDomainOptions = ["*"];
      const docSources = {
        test: "https://example.com/docs",
      };
      const openApiSpecs = { test: "https://example.com/api/v1/openapi.json" };

      const result = cliModule.processDomainOptions(
        allowDomainOptions,
        undefined,
        docSources,
        openApiSpecs
      );

      expect(result).toEqual(new Set(["*"]));
    });
  });

  describe("inferDomainsFromSources", () => {
    it("should extract domains from HTTP/HTTPS URLs", () => {
      const sources = {
        typescript: "https://example.com/typescript/llms.txt",
        nodejs: "http://nodejs.org/docs/llms.txt",
      };
      const allowedDomains = new Set<string>();

      cliModule.inferDomainsFromSources(sources, allowedDomains);

      expect(allowedDomains).toEqual(new Set(["example.com", "nodejs.org"]));
    });

    it("should not add domains when wildcard is present", () => {
      const sources = {
        typescript: "https://example.com/typescript/llms.txt",
      };
      const allowedDomains = new Set<string>(["*"]);

      cliModule.inferDomainsFromSources(sources, allowedDomains);

      expect(allowedDomains).toEqual(new Set(["*"]));
    });
  });
});
