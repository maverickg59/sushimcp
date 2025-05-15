import { vi } from "vitest";

// Common console mocks
export const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
export const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
export const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

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
  mockPathResolution,
  mockFileSystem,
  resetAllMocks,
  setupTestEnvironment,
};
