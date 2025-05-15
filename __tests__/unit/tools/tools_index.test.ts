import { describe, it, expect } from "vitest";
import * as toolsExports from "#tools/index";

describe("Tools Index", () => {
  it("should export the expected functions", () => {
    expect(toolsExports).toHaveProperty("list_llms_txt_sources");
    expect(toolsExports).toHaveProperty("fetch_llms_txt");
    expect(toolsExports).toHaveProperty("list_openapi_spec_sources");
    expect(toolsExports).toHaveProperty("fetch_openapi_spec");

    expect(typeof toolsExports.list_llms_txt_sources).toBe("function");
    expect(typeof toolsExports.fetch_llms_txt).toBe("function");
    expect(typeof toolsExports.list_openapi_spec_sources).toBe("function");
    expect(typeof toolsExports.fetch_openapi_spec).toBe("function");
  });
});

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
