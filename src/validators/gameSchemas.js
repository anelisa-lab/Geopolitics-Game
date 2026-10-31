import { z } from 'zod';

const iso2 = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Choose a country from the board.');

const soldierCount = (min) =>
  z.number({ error: 'Soldier numbers must be numbers.' })
    .int('Soldier numbers must be whole numbers.')
    .min(min, `Choose at least ${min} soldier${min === 1 ? '' : 's'}.`)
    .max(1000, 'That is too many soldiers.');

export const createGameSchema = z.object({
  iso2: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Pick a country from the list.'),
  title: z.string().trim().max(60, 'Game name can be at most 60 characters.').optional().default(''),
});

export const reinforceSchema = z.object({
  allocations: z
    .array(z.object({ iso2, count: soldierCount(1) }), { error: 'Choose where to place your reinforcements.' })
    .min(1, 'Choose where to place your reinforcements.')
    .max(10, 'You can reinforce at most 10 countries.'),
});

export const transferSchema = z.object({ from: iso2, to: iso2, count: soldierCount(1) });

export const attackSchema = z.object({ from: iso2, to: iso2 });

export const conquestMoveSchema = z.object({ count: soldierCount(0) });

// ?after=42 on the events URL. Anything invalid means "from the start"
export const eventsQuerySchema = z.object({
  after: z.coerce.number().int().min(0).catch(0),
});
