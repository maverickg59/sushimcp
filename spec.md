# Model Context Protocol Registry (MCP Registry) Specification

## Overview

The MCP Registry is a public, machine-readable and human-searchable index of `llms.txt` documents that conform to the Model Context Protocol. It consists of three key components:

1. **Registry Crawler**: Fetches and parses `llms.txt` files from known and discovered sources.
2. **Public API**: Serves data about registered MCP sources.
3. **Web Application**: Allows users to explore, search, and discover MCP servers.

---

## 1. MCP Registry Crawler

### Purpose

Collect and aggregate `llms.txt` metadata from known and discovered sources, including programmatic discovery from npm package metadata.

### Inputs

- Seed list of URLs (e.g., `https://example.com/llms.txt`)
- npm registry metadata stream, filtered by popularity

### Responsibilities

- Chunk through npm registry results in order of popularity
- Extract candidate homepage/website URLs
- Attempt `GET` requests to common `llms.txt` locations:
  - `example.com/llms.txt`
  - `example.com/llms-full.txt`
- Validate structure (e.g., must contain `context-endpoint`)
- Parse into structured metadata
- Normalize and store entries in registry
- Track last-crawled timestamps and hit/miss metrics
- Run on a scheduled CRON (e.g., daily or weekly)

### Output Format (Example Entry)

```json
{
  "source": "https://example.com/llms.txt",
  "name": "Example Agent",
  "contextEndpoint": "https://example.com/context",
  "documentation": "https://example.com/docs",
  "lastFetched": "2025-04-22T01:00:00Z",
  "raw": "..."
}
```

---

## 2. MCP Registry API

### Base URL

`https://registry.example.com/api`

### Endpoints

#### `GET /entries`

Returns a list of all known MCP sources.

- **Query Params**: `search`, `limit`, `offset`
- **Response**:

```json
[
  {
    "name": "SushiMCP",
    "contextEndpoint": "https://sushimcp.com/context",
    "documentation": "https://sushimcp.com/docs"
  }
]
```

#### `GET /entry/:id`

Returns a single entry by ID or URL slug.

#### `GET /llms.txt`

Returns a synthetic `llms.txt` file that lists the context endpoints for all known sources.

---

## 3. Web Application (Site)

### Purpose

Allow users to visually explore and search MCP context providers.

### Features

- Home page with search
- MCP server detail pages
- Link to documentation and context endpoint
- Embedded `llms.txt` preview
- Optional: submit new `llms.txt` links

---

## 4. Infrastructure Plan

### Components

- **Scheduler**: Triggers CRON jobs to pull from npm registry
- **Crawler Service**: Makes requests, validates, parses, and stores
- **Data Layer**:
  - Cloudflare KV: URL hit/miss tracking cache
  - Cloudflare Queues or Durable Objects: Manage request queue
  - D1: Permanent structured storage of validated entries
- **Cloudflare Worker**: Expose public API, handle registry interaction

---

## Licensing & Access

- Registry data under a permissive license (e.g., MIT or CC0)
- API should be open by default, rate-limited optionally

---

## Goal

To provide an indexable, trustable, and useful global directory of MCP-compatible `llms.txt` sources, empowering instant context injection into AI applications.

## Existing MCP Registry

https://llmstxt.site/
https://directory.llmstxt.cloud/
context7
https://llmstxthub.com/
