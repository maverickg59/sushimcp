/**
 * Logger utility that respects MCP_STDIO_MODE environment variable.
 * In stdio mode, logs are written to stderr as JSON objects to comply with MCP protocol.
 * In SSE mode, logs use appropriate console methods with colors for better readability.
 */

// Log levels for consistent logging
enum LogLevel {
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  DEBUG = "debug",
}

// ANSI color codes for terminal output (only used in SSE mode)
const Colors = {
  Reset: "\x1b[0m",
  Red: "\x1b[31m",
  Yellow: "\x1b[33m",
  Blue: "\x1b[34m",
  Gray: "\x1b[90m",
};

/**
 * Format a log message with appropriate prefixes and colors
 */
function formatMessage(
  level: LogLevel,
  message: string
): { stdio: string; sse: string } {
  const timestamp = new Date().toISOString();
  const levelStr = level.toUpperCase().padEnd(5);

  // In stdio mode, we need to output JSON that won't break the MCP protocol
  const stdioMessage =
    JSON.stringify({
      type: "log",
      level,
      timestamp,
      message: message.replace(/\n/g, "\\n"), // Escape newlines for JSON
    }) + "\n";

  // In SSE mode, we can use colors for better readability
  let color = Colors.Reset;
  switch (level) {
    case LogLevel.ERROR:
      color = Colors.Red;
      break;
    case LogLevel.WARN:
      color = Colors.Yellow;
      break;
    case LogLevel.INFO:
      color = Colors.Blue;
      break;
    case LogLevel.DEBUG:
      color = Colors.Gray;
      break;
  }

  const sseMessage = `${Colors.Gray}[${timestamp}]${color} [${levelStr}]${Colors.Reset} ${message}${Colors.Reset}\n`;

  return { stdio: stdioMessage, sse: sseMessage };
}

/**
 * Log a message at the specified level
 */
function log(level: LogLevel, ...args: any[]) {
  const isStdioMode = process.env.MCP_STDIO_MODE === "true";

  // Convert all arguments to strings, handling various types
  const message = args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.message}${arg.stack ? `\n${arg.stack}` : ""}`;
      } else if (typeof arg === "object" && arg !== null) {
        try {
          return JSON.stringify(arg, null, isStdioMode ? 0 : 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");

  const { stdio: stdioMessage, sse: sseMessage } = formatMessage(
    level,
    message
  );

  // In stdio mode, write JSON-formatted logs to stderr
  if (isStdioMode) {
    try {
      // Ensure we're writing valid JSON that won't break the MCP protocol
      process.stderr.write(stdioMessage);
    } catch (e) {
      // If JSON.stringify fails for some reason, write a minimal error message
      process.stderr.write(
        JSON.stringify({
          type: "log",
          level: "error",
          timestamp: new Date().toISOString(),
          message: "Failed to format log message",
          error: e instanceof Error ? e.message : String(e),
        }) + "\n"
      );
    }
    return;
  }

  // In SSE mode, use the appropriate console method with colors and formatting
  const outputMethod =
    level === LogLevel.ERROR
      ? console.error
      : level === LogLevel.WARN
      ? console.warn
      : level === LogLevel.INFO
      ? console.info
      : console.debug;

  outputMethod(sseMessage.trimEnd());
}

// Convenience methods
export const logger = {
  info: (...args: any[]) => log(LogLevel.INFO, ...args),
  warn: (...args: any[]) => log(LogLevel.WARN, ...args),
  error: (...args: any[]) => log(LogLevel.ERROR, ...args),
  debug: (...args: any[]) => log(LogLevel.DEBUG, ...args),
};

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
