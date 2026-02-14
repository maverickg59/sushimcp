import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  loggerErrorSpy,
  loggerWarnSpy,
  mockPathResolution,
  resetAllMocks,
} from "../../test-utils.js";

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

      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(loggerErrorSpy.mock.calls[0][0]).toContain(
        "Failed to load default sources: Test error reading file",
      );
      expect(result).toEqual({});
    });
  });

  describe("inferDomainsFromSources", () => {
    it("should handle URL parsing errors", () => {
      loggerErrorSpy.mockReset();

      const sources = {
        invalid: "not-a-valid-url",
      };
      const allowedDomains = new Set<string>();

      inferDomainsFromSources(sources, allowedDomains);

      expect(loggerWarnSpy).toHaveBeenCalled();
    });

    it("should respect wildcard domains and limit domain inference", () => {
      loggerErrorSpy.mockReset();

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

      // Match the actual log message format which includes timestamp and log level
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "No domains could be inferred from sources. Only local file access will be allowed.",
        ),
      );
    });
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
