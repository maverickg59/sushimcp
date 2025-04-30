import { z } from "zod";
import {
  CallToolResult,
  TextContent,
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  parseFetchTarget,
  fetchContent,
  checkDomainAccess,
} from "../lib/utils.js";

export const FetchLlmsTxtInputSchema = z.union([
  z.object({
    url: z
      .string()
      .url("Input must contain a valid URL string under the 'url' key."),
  }),
  z.array(z.string().url("Each array item must be a valid URL string")),
]);

export const fetch_llms_txt = async (
  params: z.infer<typeof FetchLlmsTxtInputSchema>,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  allowedDomains: Set<string>
): Promise<CallToolResult> => {
  console.info(`Processing fetch_docs request with params:`, params);

  try {
    const urls = Array.isArray(params) ? params : [params.url];
    const results: TextContent[] = [];

    for (const url of urls) {
      const targetInfo = await parseFetchTarget(url);

      if (targetInfo.type === "unsupported") {
        throw new Error(`For URL ${url}: ${targetInfo.reason}`);
      }
      checkDomainAccess(targetInfo, allowedDomains);

      console.info(`Fetching content for: ${url}`);
      const fileContent = await fetchContent(targetInfo);

      results.push({
        type: "text",
        text: fileContent,
      });
    }

    return {
      content: results,
    };
  } catch (error: any) {
    console.error(`Error in fetch_docs: ${error.message}`);
    throw new Error(`Failed to process fetch request: ${error.message}`);
  }
};
