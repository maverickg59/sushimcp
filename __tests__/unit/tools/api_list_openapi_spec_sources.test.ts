import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#lib/api_client", () => ({
  listOpenapiSources: vi.fn(),
}));

vi.mock("#lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { api_list_openapi_spec_sources } from "#tools/api_list_openapi_spec_sources";
import { listOpenapiSources } from "#lib/api_client";

const mockListSources = vi.mocked(listOpenapiSources);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("api_list_openapi_spec_sources", () => {
  it("should return message when no sources", async () => {
    mockListSources.mockResolvedValue([]);
    const result = await api_list_openapi_spec_sources();
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "No OpenAPI specifications available.",
    });
  });

  it("should list sources sorted alphabetically", async () => {
    mockListSources.mockResolvedValue([
      { id: 1, name: "Stripe" } as any,
      { id: 2, name: "GitHub" } as any,
      { id: 3, name: "Twilio" } as any,
    ]);
    const result = await api_list_openapi_spec_sources();
    const text = result.content[0].text;
    expect(text).toContain("Available OpenAPI specifications (3)");
    expect(text).toContain("- GitHub");
    expect(text).toContain("- Stripe");
    expect(text).toContain("- Twilio");
    // Verify alphabetical order
    const githubIdx = text.indexOf("GitHub");
    const stripeIdx = text.indexOf("Stripe");
    const twilioIdx = text.indexOf("Twilio");
    expect(githubIdx).toBeLessThan(stripeIdx);
    expect(stripeIdx).toBeLessThan(twilioIdx);
  });

  it("should include usage hint", async () => {
    mockListSources.mockResolvedValue([
      { id: 1, name: "Stripe" } as any,
    ]);
    const result = await api_list_openapi_spec_sources();
    expect(result.content[0].text).toContain("search_fetch_openapi_spec");
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
