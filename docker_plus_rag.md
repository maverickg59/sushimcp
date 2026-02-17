# SushiMCP: RAG + Docker Roadmap

## Overview

Extend SushiMCP with a RAG (Retrieval-Augmented Generation) pipeline and containerize the system. The local file cache (landed) creates the foundation — cached documentation files become the corpus for RAG indexing.

## Local File Cache (Completed)

### What landed

Fetch tools now write content to a local cache directory and return a short summary with the file path instead of raw content. Repeated calls for the same source hit the cache and skip the network fetch.

### Implementation

- **Module:** `src/lib/cache.ts` — `getCacheDir`, `readCache`, `writeCache`, `cleanExpiredEntries`, `formatCacheSummary`
- **Cache key:** SHA-256 of the source URL, truncated to 16 hex chars
- **TTL:** 48 hours (configurable via `CACHE_TTL_MS` env var)
- **Layout:** `sushimcp-cache/{llms-txt,openapi}/{hash}.txt` + `{hash}.meta.json`
- **Cleanup:** `cleanExpiredEntries()` runs at startup, deletes expired pairs and orphans
- **Integrated into:** all four fetch tools (`fetch_llms_txt`, `fetch_openapi_spec`, `api_search_fetch_llms_txt`, `api_search_fetch_openapi_spec`)

### Tool return format

```
Source: hono (llms-full.txt)
URL: https://hono.dev/llms-full.txt
File: /tmp/sushimcp-cache/llms-txt/169a2649f704cfbf.txt (336,977 characters)

Read the file above to access the documentation content.
```

### Security hardening

- Hash-only filenames — no user input in paths, no path traversal
- `lstat` checks before reads — no symlink following
- Permissions: `0o700` on directories, `0o600` on files
- Safe for tmpfs, named volumes, or bind mounts

### Portability audit findings

| Area | Status | Notes |
|------|--------|-------|
| macOS / Linux | No issues | Standard POSIX `fs` APIs, no platform-specific behavior |
| Thin client mode | No issues | Cache is local to the MCP server process; API proxy is only for source discovery |
| Direct mode | No issues | Same cache behavior, identical code path |
| Docker (with `CACHE_DIR`) | Works | Set `CACHE_DIR` env var to a mounted volume |
| Docker (without `CACHE_DIR`) | Works with caveat | Falls back to `/tmp/sushimcp-cache`; fails if root filesystem is read-only |
| Multi-instance shared volume | Low risk | Concurrent writes produce identical content (benign); cleanup during read returns null gracefully (re-fetch) |
| macOS extended attributes (`@` flag) | No impact | Node.js `fs` APIs do not interact with xattrs |

### Known limitations

- **TOCTOU gap:** `lstat` check and `readFile` are not atomic. Between the check and the read, a file could theoretically be replaced with a symlink. Low severity — cache directory has `0o700` permissions so only the owning user can modify it.
- **No dedicated unit tests:** Cache functions are mocked in tool tests but not directly tested. Should add unit tests for `readCache`, `writeCache`, `cleanExpiredEntries`.
- **Read-only root filesystem:** If `CACHE_DIR` is not set and the container has a read-only root filesystem, `mkdir` on `/tmp/sushimcp-cache` will fail. Docker deployments should always set `CACHE_DIR`.

---

## RAG System

### Architecture

```
fetch tool → cache file → RAG indexer → vector store → search tool
```

- **Corpus:** Cached llms.txt and OpenAPI spec files already on disk
- **Indexing:** Chunk cached files, generate embeddings, store in a vector DB
- **Retrieval:** New tool (or enhancement to existing search tools) that queries the vector store for semantically relevant chunks instead of returning entire documents
- **Benefit:** Instead of returning 351K chars and hoping the LLM finds the relevant section, return the 5-10 most relevant chunks (~2-5K chars total)

### Key considerations

- Index on cache write (or lazily on first query after cache)
- Re-index when cache entry expires and content is re-fetched
- Embedding model: run locally in container (e.g., ONNX runtime) or call an external API
- Vector store: lightweight, embeddable (SQLite + vector extension, or FAISS)
- Chunk strategy: respect document structure (headings, code blocks) rather than fixed-size splits

---

## Docker

### Container design

- Single container running the MCP server (stdio or SSE mode)
- `CACHE_DIR` env var points to a mounted volume for cache + vector store
- All dependencies (Node.js runtime, embedding model if local) bundled in image

### Security constraints

- **No host bind mounts** for the cache volume — use tmpfs (ephemeral) or named volumes (persistent) to prevent container-to-host filesystem escape
- **Hash-only filenames** in cache — no user input in file paths, no path traversal
- **No symlink following** when reading/writing cache files
- **`noexec` mount option** on cache volume to prevent execution of cached content
- **Read-only root filesystem** where possible, with only the cache volume writable
- Container runs as non-root user

### Volume strategy

```yaml
# Ephemeral (memory-only, no disk persistence)
volumes:
  - type: tmpfs
    target: /cache
    tmpfs:
      size: 512m

# Persistent (survives restarts, good for RAG index)
volumes:
  - sushi-data:/cache
```

The RAG vector store should live alongside the cache in the same volume, since it's derived from cached content and can be rebuilt from scratch.

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CACHE_DIR` | Yes (Docker) | `os.tmpdir()/sushimcp-cache` | Cache directory path. Must point to a writable mounted volume in Docker. |
| `CACHE_TTL_MS` | No | `172800000` (48h) | Cache entry TTL in milliseconds. |
| `API_URL` | For thin client | — | SushiMCP API backend URL. |
| `API_KEY` | For thin client | — | SushiMCP API key. |

---

## Sequencing

1. **Completed:** Local file cache with 48-hour TTL, `CACHE_DIR` env var, startup cleanup
2. **Next:** RAG indexing pipeline on cached files, vector search tool
3. **Then:** Dockerfile + compose config, CI/CD for image builds
