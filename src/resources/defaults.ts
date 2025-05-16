import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

interface ResourceHandler {
  (uri: URL): Promise<{
    contents: Array<{
      uri: string;
      text: string;
    }>;
  }>;
}

interface ProcessedResource {
  id: string;
  uri: string;
  name: string;
  description: string;
  mimetype: string;
  handler: ResourceHandler;
}

export const processDefaultsResources = (): ProcessedResource[] => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const defaultsPath = join(currentDir, "static", "defaults.json");
  const defaults = JSON.parse(readFileSync(defaultsPath, "utf8"));

  return Object.entries(defaults).map(([key, value]) => {
    const resourceName = key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
      .replace(/Docs$/, " Docs");

    const resourceDescription = key
      .split("_")
      .map((word, index) => 
        index === 0 
          ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          : word.toLowerCase()
      )
      .join(" ")
      .concat(" llms.txt");

    return {
      id: key,
      name: resourceName,
      description: resourceDescription,
      mimetype: "text/plain",
      uri: value as string,
      handler: async (uri: URL) => {
        const response = await fetch(uri.href);
        const text = await response.text();
        return {
          contents: [
            {
              uri: uri.href,
              name: resourceName,
              description: resourceDescription,
              text,
              mimetype: "text/plain",
            },
          ],
        };
      },
    };
  });
};
