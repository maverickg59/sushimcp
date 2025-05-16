import { z } from "zod";

/**
 * Schema for a single URL input that can be:
 * - A string URL
 * - An object with a url property
 */
export const UrlInputSchema = z.union([
  z.string().url("Must be a valid URL string"),
  z.object({
    url: z.string().url("Must contain a valid URL string under the 'url' key"),
  }),
]);

/**
 * Schema for an array of URL inputs
 */
export const UrlArrayInputSchema = z.array(UrlInputSchema);

/**
 * Schema for URL-based fetch operations that can accept:
 * - A single URL string
 * - A single URL object
 * - An array of URL strings and/or objects
 */
export const UrlFetchInputSchema = z.union([
  z.string().url("Input must be a valid URL string"),
  z.object({
    url: z.string().url("Input must contain a valid URL string under the 'url' key"),
  }),
  z.array(
    z.union([
      z.string().url("Each array item must be a valid URL string"),
      z.object({
        url: z.string().url(
          "Each array item must contain a valid URL string under the 'url' key"
        ),
      }),
    ])
  ),
]);

// Type exports for use in function parameters
export type UrlInput = z.infer<typeof UrlInputSchema>;
export type UrlArrayInput = z.infer<typeof UrlArrayInputSchema>;
export type UrlFetchInput = z.infer<typeof UrlFetchInputSchema>;

// Re-export the fetch schemas for backward compatibility
export const FetchLlmsTxtInputSchema = UrlFetchInputSchema;
export const FetchOpenApiSpecInputSchema = UrlFetchInputSchema;
