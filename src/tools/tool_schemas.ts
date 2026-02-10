import { z } from "zod";

/**
 * Schema for URL-based fetch operations that can accept:
 * - A single URL string
 * - A single URL object
 * - An array of URL strings and/or objects
 */
export const UrlFetchInputSchema = z.union([
  z.url(),
  z.object({
    url: z.url(),
  }),
  z.array(
    z.union([
      z.url(),
      z.object({
        url: z.url(),
      }),
    ]),
  ),
]);

// Type exports for use in function parameters
export type UrlFetchInput = z.infer<typeof UrlFetchInputSchema>;
