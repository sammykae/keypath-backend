import { z } from 'zod';

export const SearchQuerySchema = z.object({
  q: z.string().min(2).max(200).trim(),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
