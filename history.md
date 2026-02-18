# SushiMCP — Build History

> This history starts from February 2026. SushiMCP was originally built in April-May 2025 as a direct-mode MCP server with CLI-configured llms.txt and OpenAPI sources, built-in default resources, domain access control, and a comprehensive test suite. That earlier work predates this record.

---

## 2026-02-10 — Dependency updates and snapshot

Updated all dependencies to latest versions and captured a new baseline snapshot after the ~9 month gap since the May 2025 v0.1.0 release.

---

## 2026-02-14 — GitHub tools

Added GitHub integration tools for Issues, Pull Requests, and Projects V2 management.

### What changed

- **Three new tools:** `github_issues`, `github_pull_requests`, `github_projects` — registered in thin client mode only.
- **GitHub lib layer:** `src/lib/github.ts` (REST/GraphQL client helpers) and `src/lib/github_utils.ts` (ProjectV2 resolution, field auto-discovery). These are the source-of-truth implementations that were later ported to sushiapi.
- **Input schemas:** `GitHubProjectsInputSchema`, `GitHubPullRequestsInputSchema`, `GitHubIssuesInputSchema` with Zod validation.
- **Full test coverage** for all three tool modules and both lib modules.

---

## 2026-02-17 — Thin client mode

Added thin client mode where the MCP server proxies requests through the SushiAPI backend instead of using CLI-configured sources.

### What changed

- **Mode detection:** Thin client mode activates when both `API_URL` and `API_KEY` environment variables are set. CLI source arguments are ignored in this mode.
- **API client:** `src/lib/api_client.ts` — HTTP client for the SushiAPI backend. Handles listing sources, searching, and proxying GitHub operations.
- **Search+fetch tools:** `search_fetch_llms_txt` and `search_fetch_openapi_spec` — search the API for a source by name, pick the best URL variant, and fetch the content directly from upstream.
- **Resource templates:** `sushimcp://llms-txt/{name}` and `sushimcp://openapi/{name}` with autocomplete support backed by the API's source catalog.
- **Allowed domain loading:** On startup, loads allowed domains from the API's source list instead of relying on CLI flags.

---

## 2026-02-17 — Local file cache for fetch tools

Added a local disk cache so fetch tools return file path summaries instead of raw content. Solves the problem of fetched content regularly exceeding Claude Code's tool result size limit (351K chars for Hono, 12.7M for GitHub's OpenAPI spec).

### What changed

- **Cache module:** `src/lib/cache.ts` — `getCacheDir`, `readCache`, `writeCache`, `cleanExpiredEntries`, `formatCacheSummary`.
- **Cache key:** SHA-256 of the source URL, truncated to 16 hex chars. Same URL always maps to the same cache entry regardless of which tool fetched it.
- **TTL:** 48 hours by default, configurable via `CACHE_TTL_MS` env var.
- **File layout:** `sushimcp-cache/{llms-txt,openapi}/{hash}.txt` + `{hash}.meta.json`
- **Security:** Hash-only filenames (no user input in paths), `lstat` checks (no symlink following), `0o700` dir / `0o600` file permissions.
- **Docker-ready:** `CACHE_DIR` env var for custom cache location. Defaults to `os.tmpdir()/sushimcp-cache`.
- **Integrated into all four fetch tools:** `fetch_llms_txt`, `fetch_openapi_spec`, `api_search_fetch_llms_txt`, `api_search_fetch_openapi_spec`. Each checks cache before fetching, writes on miss, returns a compact summary with the file path.
- **Startup cleanup:** `cleanExpiredEntries()` runs fire-and-forget after `server.connect()`, deleting expired entries and orphaned files.
- **Tool return format changed** from raw content to:
  ```
  Source: hono (llms-full.txt)
  URL: https://hono.dev/llms-full.txt
  File: /tmp/sushimcp-cache/llms-txt/169a2649f704cfbf.txt (336,977 characters)

  Read the file above to access the documentation content.
  ```
- **Test updates:** Both `fetch_llms_txt.test.ts` and `fetch_openapi_spec.test.ts` updated to mock the cache module and assert on the new summary format. Added cache-hit test cases.

### Portability audit

Verified the cache works correctly in direct mode, thin client mode, and is portable to Docker containers. Key findings: no platform-specific behavior (standard POSIX fs APIs), `CACHE_DIR` env var must be set in Docker when root filesystem is read-only, multi-instance shared volume races are benign (concurrent writes produce identical content).

---

## 2026-02-17 — RAG pipeline (semantic search over cached docs)

Added a local RAG pipeline so users can search indexed documentation by meaning instead of reading entire files. Documents are automatically chunked and embedded in the background when fetched; the new `rag_search` tool returns the most relevant chunks.

### What changed

- **Embedding client:** `src/lib/embeddings.ts` — Ollama batch embed client (`POST /api/embed`) with health check and retry logic. Uses `qwen3-embedding:4b` (2560 dims) by default. Session-cached availability status so Ollama is only pinged once.
- **Chunker:** `src/lib/chunker.ts` — Two chunking strategies:
  - *Markdown (llms-txt):* H2 → H3 → paragraph cascade adapted from devspec. Code block protection, heading prepended for context, deterministic IDs from `{source}#{heading-slug}`, SHA-256 content hashing.
  - *OpenAPI (JSON):* Path-based splitting — one chunk per `{method} {path}` operation, one per component schema.
  - Max 1500 chars per chunk.
- **Vector store:** `src/lib/vectordb.ts` — LanceDB wrapper with explicit Apache Arrow schema, `mergeInsert` upserts, cosine similarity search with configurable character cap (default 9000), delete by source.
- **Indexer:** `src/lib/indexer.ts` — Orchestrator that checks Ollama health, chunks content by type, embeds, and stores. Called fire-and-forget from the cache layer.
- **Cache integration:** `src/lib/cache.ts` —
  - Added `contentHash` field to `CacheMeta` for change detection.
  - `writeCache` computes SHA-256 of content, compares against existing hash, skips re-indexing if unchanged, triggers fire-and-forget `indexContent` on new/changed content.
  - `readCache` backfills indexing for docs cached before the RAG pipeline existed (no `contentHash` in meta).
  - Default cache directory changed from `os.tmpdir()/sushimcp-cache` to `~/.sushimcp/cache` for persistence and security.
- **RAG search tool:** `src/tools/rag_search.ts` — `rag_search` MCP tool registered in both direct and thin client modes. Embeds the query, searches the vector index, returns formatted chunks with similarity scores. Graceful errors when Ollama is unavailable or index is empty.
- **Dependencies:** Added `@lancedb/lancedb` and `apache-arrow` (marked as tsup externals for native NAPI addon compatibility).

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base URL |
| `EMBEDDING_MODEL` | `qwen3-embedding:4b` | Embedding model name |
| `EMBEDDING_DIMS` | `2560` | Vector dimensions |
| `CACHE_DIR` | `~/.sushimcp/cache` | Cache and vector store location |

### Content hash optimization

When a cache entry is re-fetched, the content hash is compared before doing any embedding work. Docs that haven't changed (common for stable projects) never get re-embedded regardless of how many TTL cycles pass.

---

## 2026-02-17 — Documentation updates

- Updated `docker_plus_rag.md` roadmap: marked cache as completed, added portability audit findings, known limitations, and environment variable reference.
- Created `sushiapi/README.md` with architecture overview, API reference, and setup instructions.
- Evaluated `sushimcp/README.md` — no changes needed (cache is transparent to end users).
