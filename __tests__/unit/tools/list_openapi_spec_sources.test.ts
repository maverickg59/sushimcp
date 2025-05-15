import { describe, it, expect } from "vitest";
import { list_openapi_spec_sources } from "#tools/list_openapi_spec_sources";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";

describe("list_openapi_spec_sources", () => {
  it("should format and return a list of API specifications", async () => {
    const mockExtra = {} as RequestHandlerExtra<
      ServerRequest,
      ServerNotification
    >;
    const mockApiSpecs = {
      local_api: "http://localhost:8787/api/v1/openapi.json",
      prod_api: "https://api.example.com/openapi.json",
      dev_api: "https://dev.example.com/api/swagger.yaml",
    };

    const result = await list_openapi_spec_sources(mockExtra, mockApiSpecs);

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    const content = result.content[0].text;
    expect(content).toContain("Available OpenAPI specifications:");
    expect(content).toContain(
      "local_api: http://localhost:8787/api/v1/openapi.json"
    );
    expect(content).toContain("prod_api: https://api.example.com/openapi.json");
    expect(content).toContain(
      "dev_api: https://dev.example.com/api/swagger.yaml"
    );
  });

  it("should return No OpenAPI specifications configured", async () => {
    const mockExtra = {} as RequestHandlerExtra<
      ServerRequest,
      ServerNotification
    >;
    const result = await list_openapi_spec_sources(mockExtra, {});
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.content[0].text).toBe(
      "No OpenAPI specifications configured."
    );
  });

  it("should correctly format API specs with special characters in names", async () => {
    const mockExtra = {} as RequestHandlerExtra<
      ServerRequest,
      ServerNotification
    >;
    const mockApiSpecs = {
      "api-v1": "http://localhost:3000/v1/openapi.json",
      "api@v2": "http://localhost:3000/v2/openapi.yaml",
      external_api: "https://external.example.com/swagger.json",
    };

    const result = await list_openapi_spec_sources(mockExtra, mockApiSpecs);
    const content = result.content[0].text;
    expect(content).toContain("Available OpenAPI specifications:");
    expect(content).toContain("api-v1: http://localhost:3000/v1/openapi.json");
    expect(content).toContain("api@v2: http://localhost:3000/v2/openapi.yaml");
    expect(content).toContain(
      "external_api: https://external.example.com/swagger.json"
    );
  });
});

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
