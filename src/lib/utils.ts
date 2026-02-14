import { URL, fileURLToPath } from "url";
import fs from "fs/promises";
import path from "path";
import { readFileSync } from "fs";
import { logger } from "./logger.js";

// --- Type Definitions ---
export type TargetInfo =
  | { type: "remote"; url: URL; hostname: string }
  | { type: "localFileUrl"; filePath: string; url: URL }
  | { type: "localPath"; resolvedPath: string; originalInput: string }
  | { type: "unsupported"; reason: string; originalInput: string };

// --- Domain Handling ---
export function extractDomain(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.hostname.toLowerCase();
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(
      `Invalid URL format: ${errorMessage}. Only http, https, and file protocols are supported.`,
    );
  }
  return null;
}

export function checkDomainAccess(
  targetInfo: TargetInfo,
  allowedDomains: Set<string>,
): void {
  if (targetInfo.type === "remote") {
    if (!allowedDomains.has("*") && !allowedDomains.has(targetInfo.hostname)) {
      logger.error(
        `Domain '${targetInfo.hostname}' is not in the allowed domains list.`,
      );
      throw new Error(
        `Access denied: Fetching from domain '${targetInfo.hostname}' is not allowed by server configuration. Ask user to add domain to allow list.`,
      );
    }
    logger.info(`Domain '${targetInfo.hostname}' is allowed.`);
  } else if (
    targetInfo.type === "localFileUrl" ||
    targetInfo.type === "localPath"
  ) {
    logger.warn("Local file access permitted.");
  } else {
    throw new Error(
      `Internal error: Unsupported target type '${targetInfo.type}' during access check.`,
    );
  }
}

export async function parseFetchTarget(
  targetUrlString: string,
): Promise<TargetInfo> {
  try {
    const targetUrl = new URL(targetUrlString);
    if (targetUrl.protocol === "http:" || targetUrl.protocol === "https:") {
      return {
        type: "remote",
        url: targetUrl,
        hostname: targetUrl.hostname.toLowerCase(),
      };
    } else if (targetUrl.protocol === "file:") {
      try {
        const filePath = path.resolve(fileURLToPath(targetUrl));
        return {
          type: "localFileUrl",
          filePath,
          url: targetUrl,
        };
      } catch (err: any) {
        return {
          type: "unsupported",
          originalInput: targetUrlString,
          reason: `Failed to convert file: URL to path: ${err.message}`,
        };
      }
    } else {
      return {
        type: "unsupported",
        originalInput: targetUrlString,
        reason: `Unsupported URL protocol: ${targetUrl.protocol}`,
      };
    }
  } catch (urlError) {
    try {
      const resolvedPath = path.resolve(targetUrlString);
      try {
        await fs.stat(resolvedPath);
      } catch (statError) {
        throw new Error(
          `Path does not exist or is inaccessible: ${resolvedPath}`,
        );
      }
      return {
        type: "localPath",
        resolvedPath,
        originalInput: targetUrlString,
      };
    } catch (pathError: any) {
      const urlErrorMessage =
        urlError instanceof Error ? urlError.message : String(urlError);
      return {
        type: "unsupported",
        originalInput: targetUrlString,
        reason: `Invalid URL ('${urlErrorMessage}') and failed to resolve as path: ${pathError.message}`,
      };
    }
  }
}

export async function fetchContent(targetInfo: TargetInfo): Promise<string> {
  switch (targetInfo.type) {
    case "remote": {
      logger.info(`Fetching remote URL: ${targetInfo.url.toString()}`);
      const response = await fetch(targetInfo.url.toString());
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.text();
    }
    case "localFileUrl":
      logger.info(
        `Reading local file path from file: URL: ${targetInfo.filePath}`,
      );
      return await fs.readFile(targetInfo.filePath, "utf-8");
    case "localPath":
      logger.info(
        `Reading local file path directly: ${targetInfo.resolvedPath}`,
      );
      return await fs.readFile(targetInfo.resolvedPath, "utf-8");
    case "unsupported":
      throw new Error(
        `Cannot fetch content for unsupported target type: ${targetInfo.reason}`,
      );
    default: {
      const exhaustiveCheck: never = targetInfo;
      throw new Error(
        `Internal error: Unhandled target info type: ${JSON.stringify(
          exhaustiveCheck,
        )}`,
      );
    }
  }
}

export type UrlInput = { url: string } | string;

export const normalizeUrlInput = (
  input: UrlInput | UrlInput[],
): { url: string }[] => {
  if (Array.isArray(input)) {
    return input.map((item) =>
      typeof item === "string" ? { url: item } : item,
    );
  }
  return [typeof input === "string" ? { url: input } : input];
};

export function getVersion(): string {
  const __filename = fileURLToPath(import.meta.url);
  let dir = path.dirname(__filename);
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, "package.json");
    try {
      const pkg = JSON.parse(readFileSync(candidate, "utf-8"));
      if (pkg.version) return pkg.version;
    } catch {}
    dir = path.dirname(dir);
  }
  return "unknown";
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
