import { z } from 'zod';

// .catch() swaps anything invalid in the URL for a safe default, so a typo never breaks the page
export const gameListQuerySchema = z.object({
  q: z.string().trim().max(50).catch(''),
  status: z.enum(['active', 'won', 'lost']).optional().catch(undefined),
  sort: z.enum(['newest', 'oldest', 'rounds']).catch('newest'),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});