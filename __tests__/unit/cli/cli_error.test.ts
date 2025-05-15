import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { 
  consoleErrorSpy, 
  consoleWarnSpy, 
  mockPathResolution,
  resetAllMocks 
} from "../../test-utils";

vi.mock("node:fs");
vi.mock("node:path");
vi.mock("commander");
vi.mock("#lib/utils.js");
vi.mock("#lib/cli_lib.js");

import { loadDefaultSources, inferDomainsFromSources } from "#lib/cli";

describe("CLI Error Handling", () => {
  beforeEach(() => {
    resetAllMocks();
    mockPathResolution(path);
  });

  describe("loadDefaultSources", () => {
    it("should handle and log errors when reading defaults file", () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("Test error reading file");
      });

      const result = loadDefaultSources("/path/to/defaults.yaml");

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain(
        "Error reading or parsing defaults file"
      );
      expect(result).toEqual({});
    });
  });

  describe("inferDomainsFromSources", () => {
    it("should handle URL parsing errors", () => {
      consoleErrorSpy.mockReset();

      const sources = {
        invalid: "not-a-valid-url",
      };
      const allowedDomains = new Set<string>();

      inferDomainsFromSources(sources, allowedDomains);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it("should respect wildcard domains and limit domain inference", () => {
      consoleErrorSpy.mockReset();

      const allowedDomains = new Set<string>(["*"]);

      const sources = {
        test: "https://example.com/path",
      };

      inferDomainsFromSources(sources, allowedDomains);

      expect(allowedDomains.has("*")).toBe(true);

      const emptyAllowedDomains = new Set<string>(["*"]);
      inferDomainsFromSources({}, emptyAllowedDomains);
      expect(emptyAllowedDomains.size).toBe(1);
    });

    it("should log a warning when no domains are specified or inferred", () => {
      const sources = {};
      const allowedDomains = new Set<string>();

      inferDomainsFromSources(sources, allowedDomains);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Warning: No domains specified or inferred. Fetching might be restricted."
      );
    });
  });
});

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
