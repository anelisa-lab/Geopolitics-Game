import { z } from 'zod';

export const createGameSchema = z.object({
  iso2: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Pick a country from the list.'),
  title: z.string().trim().max(60, 'Game name can be at most 60 characters.').optional().default(''),
});