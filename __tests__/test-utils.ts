import { vi } from "vitest";
import { logger } from "../src/lib/index.js";

// Common console mocks
export const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
  // Extract the actual message from the formatted log
  const message = args[0];
  if (typeof message === 'string' && message.includes('[ERROR]')) {
    // Pass through the full formatted message for error logs
    console.log(...args);
  }
});

export const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
  // Extract the actual message from the formatted log
  const message = args[0];
  if (typeof message === 'string' && message.includes('[WARN]')) {
    // For test assertions, we'll match against the full formatted message
    console.log(...args);
  }
});

export const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation((...args) => {
  // Extract the actual message from the formatted log
  const message = args[0];
  if (typeof message === 'string' && message.includes('[INFO]')) {
    // For test assertions, we'll match against the full formatted message
    console.log(...args);
  }
});

// Logger mocks that combine with the console spies
export const loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation((...args) => {
  // Forward to console.error which is already spied on
  console.error(...args);
});

export const loggerWarnSpy = vi.spyOn(logger, "warn").mockImplementation((...args) => {
  // Forward to console.warn which is already spied on
  console.warn(...args);
});

export const loggerInfoSpy = vi.spyOn(logger, "info").mockImplementation((...args) => {
  // Forward to console.info which is already spied on
  console.info(...args);
});

export const loggerDebugSpy = vi.spyOn(logger, "debug").mockImplementation((...args) => {
  // Just capture calls, don't forward
});

// Common mock implementations
export const mockPathResolution = (path: any) => ({
  resolve: vi.fn().mockImplementation((...parts: string[]) => parts.join("/")),
  join: vi.fn().mockImplementation((...parts: string[]) => parts.join("/")),
  dirname: vi.fn().mockImplementation((p: string) => {
    const parts = p.split("/");
    return parts.slice(0, -1).join("/") || "/";
  }),
  basename: vi.fn().mockImplementation((p: string) => {
    const parts = p.split("/");
    return parts[parts.length - 1];
  }),
  extname: vi.fn().mockImplementation((p: string) => {
    const match = p.match(/\.([^.]+)$/);
    return match ? `.${match[1]}` : "";
  }),
  ...path,
});

// Common mock file system
export const mockFileSystem = (fs: any) => ({
  readFile: vi.fn().mockImplementation((path: string) => {
    if (path.includes("package.json")) {
      return Promise.resolve(JSON.stringify({ version: "1.0.0" }));
    }
    return Promise.resolve("file content");
  }),
  readFileSync: vi.fn().mockImplementation((path: string) => {
    if (path.includes("package.json")) {
      return JSON.stringify({ version: "1.0.0" });
    }
    return "file content";
  }),
  ...fs,
});

// Reset all mocks
export const resetAllMocks = () => {
  consoleErrorSpy.mockClear();
  consoleWarnSpy.mockClear();
  consoleInfoSpy.mockClear();
  loggerErrorSpy.mockClear();
  loggerWarnSpy.mockClear();
  loggerInfoSpy.mockClear();
  loggerDebugSpy.mockClear();
  vi.clearAllMocks();
};

// Common test setup
export const setupTestEnvironment = () => {
  // Setup any global mocks or environment variables here
  process.env.NODE_ENV = "test";
  
  return {
    // Return any cleanup functions if needed
    cleanup: () => {
      // Cleanup code if needed
    },
  };
};

export default {
  consoleErrorSpy,
  consoleWarnSpy,
  consoleInfoSpy,
  loggerErrorSpy,
  loggerWarnSpy,
  loggerInfoSpy,
  loggerDebugSpy,
  mockPathResolution,
  mockFileSystem,
  resetAllMocks,
  setupTestEnvironment,
};
