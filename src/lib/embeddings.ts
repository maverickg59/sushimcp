import { logger } from "./logger.js";

// qwen3-embedding:4b native output is 2560 dimensions
export const EMBED_DIMS = parseInt(process.env.EMBEDDING_DIMS || "2560", 10);

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const HEALTH_RETRIES = 3;
const HEALTH_RETRY_DELAY_MS = 2000;

function getModelName(): string {
  const raw = process.env.EMBEDDING_MODEL || "qwen3-embedding:4b";
  // Strip provider prefix for raw Ollama API
  return raw.replace(/^ollama\//, "");
}

let ollamaAvailable: boolean | null = null;

/**
 * Check if Ollama is running and the embedding model is available.
 * Retries up to HEALTH_RETRIES times with a short delay.
 * Caches the result for the session.
 */
export async function checkOllamaHealth(): Promise<boolean> {
  if (ollamaAvailable !== null) return ollamaAvailable;

  for (let attempt = 1; attempt <= HEALTH_RETRIES; attempt++) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name: string }> };
        const model = getModelName();
        const hasModel = data.models?.some(
          (m) => m.name === model || m.name.startsWith(`${model}:`),
        );

        if (!hasModel) {
          logger.warn(
            `Ollama is running but model "${model}" not found. ` +
              `Install it with: ollama pull ${model}`,
          );
          // Ollama is running, model just needs to be pulled — still mark available
          // Ollama will auto-pull on first embed request in many configurations
        }

        ollamaAvailable = true;
        logger.info("Ollama health check passed");
        return true;
      }
    } catch {
      if (attempt < HEALTH_RETRIES) {
        logger.debug(
          `Ollama health check attempt ${attempt}/${HEALTH_RETRIES} failed, retrying...`,
        );
        await new Promise((r) => setTimeout(r, HEALTH_RETRY_DELAY_MS));
      }
    }
  }

  ollamaAvailable = false;
  logger.error(
    `Ollama is not responding at ${OLLAMA_URL}. ` +
      "RAG features disabled for this session. " +
      "Please ensure Ollama is installed and running (https://ollama.com).",
  );
  return false;
}

/**
 * Returns true if Ollama is available for embedding. Non-blocking check
 * of the cached health status. Returns null if not yet checked.
 */
export function isOllamaAvailable(): boolean | null {
  return ollamaAvailable;
}

/**
 * Embed an array of texts using Ollama's batch embed endpoint.
 * Processes in batches to avoid overloading.
 */
export async function embedTexts(
  texts: string[],
  batchSize = 50,
): Promise<number[][]> {
  if (!(await checkOllamaHealth())) {
    throw new Error("Ollama is not available — cannot generate embeddings");
  }

  const model = getModelName();
  const allEmbeddings: number[][] = [];
  const totalBatches = Math.ceil(texts.length / batchSize);

  for (let i = 0; i < texts.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batchEnd = Math.min(i + batchSize, texts.length);

    if (totalBatches > 1) {
      logger.debug(
        `Embedding batch ${batchNum}/${totalBatches} (${i + 1}–${batchEnd} of ${texts.length})`,
      );
    }

    const batchStart = Date.now();
    const batch = texts.slice(i, i + batchSize);

    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: batch }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama embed failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { embeddings: number[][] };
    allEmbeddings.push(...data.embeddings);

    if (totalBatches > 1) {
      const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
      logger.debug(`  batch ${batchNum} done in ${elapsed}s`);
    }
  }

  return allEmbeddings;
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
