import { z } from "zod";

/**
 * Schema for URL-based fetch operations that can accept:
 * - A single URL string
 * - A single URL object
 * - An array of URL strings and/or objects
 */
export const UrlFetchInputSchema = z.union([
  z.string().url("Input must be a valid URL string"),
  z.object({
    url: z
      .string()
      .url("Input must contain a valid URL string under the 'url' key"),
  }),
  z.array(
    z.union([
      z.string().url("Each array item must be a valid URL string"),
      z.object({
        url: z
          .string()
          .url(
            "Each array item must contain a valid URL string under the 'url' key"
          ),
      }),
    ])
  ),
]);

// Type exports for use in function parameters
export type UrlFetchInput = z.infer<typeof UrlFetchInputSchema>;
