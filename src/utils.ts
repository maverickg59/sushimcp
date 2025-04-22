import { URL, fileURLToPath } from "url";
import fs from "fs/promises";
import path from "path";

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
  } catch (e) {
    // Ignore errors, might be a local path or invalid URL
    console.error(
      `Could not parse '${urlString}' as URL for domain extraction.`
    );
  }
  return null;
}

export function checkDomainAccess(
  targetInfo: TargetInfo,
  allowedDomains: Set<string>
): void {
  if (targetInfo.type === "remote") {
    if (!allowedDomains.has("*") && !allowedDomains.has(targetInfo.hostname)) {
      console.error(
        `Access denied: Domain '${
          targetInfo.hostname
        }' is not in the allowed list: ${[...allowedDomains].join(", ")}`
      );
      throw new Error(
        `Access denied: Fetching from domain '${targetInfo.hostname}' is not allowed by server configuration.`
      );
    }
    console.error(`Domain '${targetInfo.hostname}' is allowed.`); // Log to stderr
  } else if (
    targetInfo.type === "localFileUrl" ||
    targetInfo.type === "localPath"
  ) {
    console.error("Local file access permitted."); // Log to stderr
    // Add more checks here if needed (e.g., ensure path is within a specific root?)
  } else {
    // Should not happen if called after parseFetchTarget successfully returns a valid type
    throw new Error(
      `Internal error: Unsupported target type '${targetInfo.type}' during access check.`
    );
  }
}

// --- Parsing and Fetching ---
export async function parseFetchTarget(
  targetUrlString: string
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
    // If it's not a valid URL, attempt to treat it as a local path.
    try {
      const resolvedPath = path.resolve(targetUrlString);
      // Check if the path actually exists (optional, but good practice)
      try {
        await fs.stat(resolvedPath);
      } catch (statError) {
        throw new Error(
          `Path does not exist or is inaccessible: ${resolvedPath}`
        );
      }
      return {
        type: "localPath",
        resolvedPath,
        originalInput: targetUrlString,
      };
    } catch (pathError: any) {
      // It's neither a valid URL nor a resolvable path.
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
      console.error(`Fetching remote URL: ${targetInfo.url.toString()}`); // Log to stderr
      const response = await fetch(targetInfo.url.toString());
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.text();
    }
    case "localFileUrl":
      console.error(
        `Reading local file path from file: URL: ${targetInfo.filePath}` // Log to stderr
      );
      return await fs.readFile(targetInfo.filePath, "utf-8");
    case "localPath":
      console.error(
        `Reading local file path directly: ${targetInfo.resolvedPath}` // Log to stderr
      );
      return await fs.readFile(targetInfo.resolvedPath, "utf-8");
    case "unsupported":
      throw new Error(
        `Cannot fetch content for unsupported target type: ${targetInfo.reason}`
      );
    default: {
      // This should be unreachable due to TypeScript's exhaustiveness checks
      // If it happens, it's an internal logic error.
      const exhaustiveCheck: never = targetInfo;
      throw new Error(
        `Internal error: Unhandled target info type: ${JSON.stringify(
          exhaustiveCheck
        )}`
      );
    }
  }
}

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
