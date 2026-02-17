# SushiMCP: RAG + Docker Roadmap

## Overview

Extend SushiMCP with a RAG (Retrieval-Augmented Generation) pipeline and containerize the system. The local file cache (landing now) creates the foundation — cached documentation files become the corpus for RAG indexing.

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

## Sequencing

1. **Now:** Local file cache with 48-hour TTL, `CACHE_DIR` env var
2. **Next:** RAG indexing pipeline on cached files, vector search tool
3. **Then:** Dockerfile + compose config, CI/CD for image builds
