import { z } from 'zod';

export const MAX_SEARCH_QUERY_LENGTH = 500;

export const searchRequestSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, 'Query must not be empty')
    .max(MAX_SEARCH_QUERY_LENGTH, `Query must not exceed ${MAX_SEARCH_QUERY_LENGTH} characters`),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const matchTypeSchema = z.enum(['KEYWORD', 'SEMANTIC', 'BOTH']);
export type MatchType = z.infer<typeof matchTypeSchema>;

export const searchResultItemSchema = z.object({
  threadId: z.string().uuid(),
  threadHeadline: z.string(),
  summarySnippet: z.string().nullable(),
  workstreamName: z.string().nullable(),
  sourceThreadUrl: z.string().nullable(),
  relevanceScore: z.number(),
  matchType: matchTypeSchema,
});

export type SearchResultItem = z.infer<typeof searchResultItemSchema>;

export const searchResponseMetaSchema = z.object({
  total: z.number().int(),
  query: z.string(),
  searchTimeMs: z.number(),
});

export type SearchResponseMeta = z.infer<typeof searchResponseMetaSchema>;

export const searchResponseSchema = z.object({
  results: z.array(searchResultItemSchema),
  meta: searchResponseMetaSchema,
  suggestions: z.array(z.string()).optional(),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;
