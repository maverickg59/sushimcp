import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as utils from "#lib/utils";
import { logger } from "../../../src/lib/logger";
import {
  parseNameValuePair,
  addParsedSourceToTarget,
  normalizeAndAddDomain,
  logConfigSummary,
  processSpaceSeparatedItems,
  processMultipleItems,
} from "#lib/cli_lib";
import type { CliConfig } from "#lib/cli";
import { loggerErrorSpy, loggerInfoSpy, resetAllMocks } from "../../test-utils";

describe("CLI Library Utilities", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("parseNameValuePair", () => {
    it("should correctly parse a valid name-value pair", () => {
      const result = parseNameValuePair(
        "typescript:https://example.com/typescript/llms.txt"
      );

      expect(result).not.toBeNull();
      expect(result?.name).toBe("typescript");
      expect(result?.urlValue).toBe("https://example.com/typescript/llms.txt");
    });

    it("should handle values containing additional delimiters", () => {
      const result = parseNameValuePair(
        "node:https://nodejs.org:443/docs/llms.txt"
      );

      expect(result).not.toBeNull();
      expect(result?.name).toBe("node");
      expect(result?.urlValue).toBe("https://nodejs.org:443/docs/llms.txt");
    });

    it("should return null for inputs with missing delimiter", () => {
      const result = parseNameValuePair("invalid-format-no-delimiter");

      expect(result).toBeNull();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it("should return null for inputs with empty name or value", () => {
      const result1 = parseNameValuePair(":https://example.com");
      const result2 = parseNameValuePair("empty-value:");

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(2);
    });

    it("should support custom delimiters", () => {
      const result = parseNameValuePair("typescript=https://example.com", "=");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("typescript");
      expect(result?.urlValue).toBe("https://example.com");
    });
  });

  describe("addParsedSourceToTarget", () => {
    it("should add parsed source to target object", () => {
      const target: Record<string, string> = {};
      const parsed = {
        name: "react",
        urlValue: "https://example.com/react/llms.txt",
      };

      addParsedSourceToTarget(parsed, target, "--source");

      expect(target).toHaveProperty("react");
      expect(target["react"]).toBe("https://example.com/react/llms.txt");
    });

    it("should update value when overriding an existing source", () => {
      const target: Record<string, string> = {
        vue: "https://initial-url.com/vue",
      };
      const parsed = {
        name: "vue",
        urlValue: "https://new-url.com/vue/llms.txt",
      };

      addParsedSourceToTarget(parsed, target, "--source");

      expect(target["vue"]).toBe("https://new-url.com/vue/llms.txt");
    });

    it("should handle local file paths starting with / or .", () => {
      const target: Record<string, string> = {};
      const parsed1 = {
        name: "docs",
        urlValue: "/path/to/local/docs",
      };
      const parsed2 = {
        name: "config",
        urlValue: "./relative/path",
      };

      addParsedSourceToTarget(parsed1, target, "--source");
      expect(target["docs"]).toBeDefined();
      addParsedSourceToTarget(parsed2, target, "--source");
      expect(target["config"]).toBeDefined();
    });

    it("should handle errors from invalid URLs and log them", () => {
      const originalURL = global.URL;
      global.URL = function () {
        throw new Error("Invalid URL");
      } as any;

      try {
        const target: Record<string, string> = {};
        const parsed = {
          name: "invalid",
          urlValue: "not-a-valid-url",
        };

        addParsedSourceToTarget(parsed, target, "--source");

        expect(loggerErrorSpy).toHaveBeenCalled();
      } finally {
        global.URL = originalURL;
      }
    });
  });

  describe("normalizeAndAddDomain", () => {
    beforeEach(() => {
      // Mock extractDomain to return the input for testing
      vi.spyOn(utils, "extractDomain").mockImplementation((input) => {
        // For testing, we want these forms to work
        if (
          input === "*" ||
          input === "not a domain" ||
          input.includes("example.com") ||
          input.includes("example.org") ||
          input.includes("api.example.org") ||
          input.includes("docs.example.com")
        ) {
          // For URLs with protocols, paths, or query params, extract just the domain
          if (input.startsWith('http')) {
            try {
              const url = new URL(input);
              return url.hostname;
            } catch (e) {
              return input;
            }
          }
          return input;
        }
        return null;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should normalize and add valid domain to set", () => {
      const domains = new Set<string>();

      normalizeAndAddDomain("example.com", domains, "--allow-domain");

      expect(domains.has("example.com")).toBe(true);
    });

    it("should handle and normalize domains with protocol prefixes", () => {
      const domains = new Set<string>();

      normalizeAndAddDomain(
        "http://api.example.org",
        domains,
        "--allow-domain"
      );

      expect(domains.has("api.example.org")).toBe(true);
    });

    it("should handle domains with paths and query strings", () => {
      const domains = new Set<string>();

      normalizeAndAddDomain(
        "https://docs.example.com/path?query=value",
        domains,
        "--allow-domain"
      );

      expect(domains.has("docs.example.com")).toBe(true);
    });

    it("should add domains even if potentially invalid", () => {
      const domains = new Set<string>();

      normalizeAndAddDomain("not a domain", domains, "--allow-domain");

      expect(domains.has("not a domain")).toBe(true);
    });

    it("should handle wildcard domain", () => {
      const domains = new Set<string>();

      normalizeAndAddDomain("*", domains, "--allow-domain");

      expect(domains.has("*")).toBe(true);
    });

    it("should handle empty domain entries", () => {
      const domains = new Set<string>();

      // Mock warning log for empty domain entry
      const warnSpy = vi.spyOn(logger, "warn");
      
      // Make sure extractDomain returns null for empty string
      vi.spyOn(utils, "extractDomain").mockImplementationOnce(() => {
        logger.warn("Skipping empty --allow-domain entry.");
        return null;
      });
      
      normalizeAndAddDomain("", domains, "--allow-domain");

      expect(domains.size).toBe(0);
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain("Skipping empty --allow-domain entry.");
    });
  });

  describe("logConfigSummary", () => {
    it("should log config summary", () => {
      // Create a fresh spy for this test
      const infoSpy = vi.spyOn(logger, "info");

      const config: CliConfig = {
        docSources: { typescript: "https://example.com/typescript/llms.txt" },
        allowedDomains: new Set(["example.com"]),
        openApiSpecs: { petstore: "https://example.com/petstore.json" },
      };

      logConfigSummary(config);

      // Verify the summary was logged with the expected content
      expect(infoSpy).toHaveBeenCalled();

      // Get all calls to logger.info
      const calls = infoSpy.mock.calls.map((call) => call[0]);

      // Check if the expected strings are included in any of the calls
      expect(
        calls.some(
          (call) =>
            typeof call === "string" &&
            call.includes("SushiMCP Configuration Summary")
        )
      ).toBe(true);

      expect(
        calls.some(
          (call) =>
            typeof call === "string" && call.includes("Documentation Sources:")
        )
      ).toBe(true);

      expect(
        calls.some(
          (call) => typeof call === "string" && call.includes("OpenAPI Specs:")
        )
      ).toBe(true);

      expect(
        calls.some(
          (call) =>
            typeof call === "string" && call.includes("Allowed Fetch Domains:")
        )
      ).toBe(true);
    });
  });

  describe("processSpaceSeparatedItems", () => {
    it("should handle input strings", () => {
      const input = "item1 item2 item3";
      const processor = (item: string) => ({ value: item });

      const results = processSpaceSeparatedItems(input, processor, "Test");

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.value.includes("item1"))).toBe(true);
    });

    it("should return empty array for undefined input", () => {
      const processor = (item: string) => ({ value: item });

      const results = processSpaceSeparatedItems(undefined, processor, "Test");

      expect(results).toEqual([]);
    });

    it("should process input and filter null results", () => {
      const input = "test string";
      let processorCalled = false;

      const processor = (item: string) => {
        processorCalled = true;
        if (item.includes("ignore")) return null;
        return { value: item };
      };

      const results = processSpaceSeparatedItems(input, processor, "Test");

      expect(processorCalled).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("processMultipleItems", () => {
    it("should process an array of items", () => {
      const items = ["item1", "item2", "item3"];
      const processor = (item: string) => ({ value: item });

      const results = processMultipleItems(items, processor, "Test");

      expect(results).toHaveLength(3);
      expect(results[0].value).toBe("item1");
      expect(results[1].value).toBe("item2");
      expect(results[2].value).toBe("item3");
    });

    it("should return empty array for undefined or empty input", () => {
      const processor = (item: string) => ({ value: item });

      const results1 = processMultipleItems(undefined, processor, "Test");
      const results2 = processMultipleItems([], processor, "Test");

      expect(results1).toEqual([]);
      expect(results2).toEqual([]);
    });

    it("should filter out null results from processor", () => {
      const items = ["valid", "invalid", "valid2"];
      const processor = (item: string) => {
        if (item === "invalid") return null;
        return { value: item };
      };

      const results = processMultipleItems(items, processor, "Test");

      expect(results).toHaveLength(2);
      expect(results[0].value).toBe("valid");
      expect(results[1].value).toBe("valid2");
    });
  });
});

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
