import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#lib/api_client", () => ({
  listLlmsTxtSources: vi.fn(),
}));

vi.mock("#lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { api_list_llms_txt_sources } from "#tools/api_list_llms_txt_sources";
import { listLlmsTxtSources } from "#lib/api_client";

const mockListSources = vi.mocked(listLlmsTxtSources);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("api_list_llms_txt_sources", () => {
  it("should return message when no sources", async () => {
    mockListSources.mockResolvedValue([]);
    const result = await api_list_llms_txt_sources();
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "No llms.txt sources available.",
    });
  });

  it("should group sources by category", async () => {
    mockListSources.mockResolvedValue([
      { id: 1, name: "React", baseUrl: "https://react.dev", category: "Frontend", status: "active" } as any,
      { id: 2, name: "Vue", baseUrl: "https://vuejs.org", category: "Frontend", status: "active" } as any,
      { id: 3, name: "Hono", baseUrl: "https://hono.dev", category: "Backend", status: "active" } as any,
    ]);
    const result = await api_list_llms_txt_sources();
    const text = result.content[0].text;
    expect(text).toContain("Available llms.txt sources (3)");
    expect(text).toContain("Backend: Hono");
    expect(text).toContain("Frontend: React, Vue");
  });

  it("should sort 'Other' category last", async () => {
    mockListSources.mockResolvedValue([
      { id: 1, name: "Misc", baseUrl: "https://misc.com", category: null, status: "active" } as any,
      { id: 2, name: "React", baseUrl: "https://react.dev", category: "Frontend", status: "active" } as any,
    ]);
    const result = await api_list_llms_txt_sources();
    const text = result.content[0].text;
    const frontendIdx = text.indexOf("Frontend");
    const otherIdx = text.indexOf("Other");
    expect(frontendIdx).toBeLessThan(otherIdx);
  });

  it("should sort names alphabetically within category", async () => {
    mockListSources.mockResolvedValue([
      { id: 1, name: "Vue", baseUrl: "https://vuejs.org", category: "Frontend", status: "active" } as any,
      { id: 2, name: "Angular", baseUrl: "https://angular.dev", category: "Frontend", status: "active" } as any,
      { id: 3, name: "React", baseUrl: "https://react.dev", category: "Frontend", status: "active" } as any,
    ]);
    const result = await api_list_llms_txt_sources();
    const text = result.content[0].text;
    expect(text).toContain("Frontend: Angular, React, Vue");
  });

  it("should include usage hint", async () => {
    mockListSources.mockResolvedValue([
      { id: 1, name: "React", baseUrl: "https://react.dev", category: "Frontend", status: "active" } as any,
    ]);
    const result = await api_list_llms_txt_sources();
    expect(result.content[0].text).toContain("search_fetch_llms_txt");
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
