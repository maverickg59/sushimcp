import { z } from "zod";
import {
  CallToolResult,
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";

export const SushiDigestInputSchema = z.object({
  name: z.string(),
});

export const sushi_digest = async (
  params: z.infer<typeof SushiDigestInputSchema>,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<CallToolResult> => {
  const { name } = params;
  console.info(`Processing sushi_digest request for name: ${name}`);

  try {
    // TODO: Implement sushi_digest logic
    return {
      content: [
        {
          type: "text",
          text: `sushi_digest not implemented for name: ${name}`,
        },
      ],
    };
  } catch (error: any) {
    console.error(`Error in sushi_digest for ${name}: ${error.message}`);
    throw new Error(
      `Failed to process sushi_digest request for '${name}': ${error.message}`
    );
  }
};
