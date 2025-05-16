/**
 * Logger utility that outputs formatted logs to stderr with colors and timestamps
 */

// Log levels for consistent logging
enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG",
}

// ANSI color codes for terminal output
const Colors = {
  Reset: "\x1b[0m",
  Red: "\x1b[31m",
  Yellow: "\x1b[33m",
  Blue: "\x1b[94m",
  Cyan: "\x1b[36m",
  Gray: "\x1b[90m",
  White: "\x1b[37m",
};

/**
 * Format a log message with timestamp, log level, and colors
 */
function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  const timestampStr = `${Colors.Gray}${timestamp}${Colors.Reset}`;
  
  let levelStr: string;
  let color: string;
  
  switch (level) {
    case LogLevel.ERROR:
      color = Colors.Red;
      levelStr = `${color}${level.padEnd(5)}${Colors.Reset}`;
      break;
    case LogLevel.WARN:
      color = Colors.Yellow;
      levelStr = `${color}${level.padEnd(5)}${Colors.Reset}`;
      break;
    case LogLevel.INFO:
      color = Colors.Cyan;
      levelStr = `${color}${level.padEnd(5)}${Colors.Reset}`;
      break;
    case LogLevel.DEBUG:
      color = Colors.Gray;
      levelStr = `${color}${level.padEnd(5)}${Colors.Reset}`;
      break;
    default:
      color = Colors.White;
      levelStr = String(level).padEnd(5);
  }
  
  return `${timestampStr} ${levelStr} ${color}${message}${Colors.Reset}\n`;
}

/**
 * Log a message at the specified level to stderr
 */
function log(level: LogLevel, ...args: any[]) {
  // Convert all arguments to strings, handling various types
  const message = args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.message}${arg.stack ? `\n${arg.stack}` : ""}`;
      } else if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  const formattedMessage = formatMessage(level, message);
  
  // Always write to stderr with colors
  process.stderr.write(formattedMessage);
}

// Convenience methods
export const logger = {
  info: (...args: any[]) => log(LogLevel.INFO, ...args),
  warn: (...args: any[]) => log(LogLevel.WARN, ...args),
  error: (...args: any[]) => log(LogLevel.ERROR, ...args),
  debug: (...args: any[]) => log(LogLevel.DEBUG, ...args),
};

// Log unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);});

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
