import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommentaryService } from '../src/ai/CommentaryService.js';

// Just enough of a game for the names
const game = {
  territories: [{ iso2: 'IT', name: 'Italy' }, { iso2: 'VA', name: 'Holy See' }, { iso2: 'MM', name: 'Myanmar' }, { iso2: 'LA', name: 'Laos' }],
};

const roll = (from, to, roll, extra = {}) => ({
  type: 'DICE_ROLL',
  playerId: from,
  payload: { from, to, roll, pairs: [{ attack: 6, defend: 2, winner: 'attacker' }], attackerLosses: 0, defenderLosses: 1, attackerSoldiers: 8, defenderSoldiers: 0, ...extra },
});

// A pretend AI that gives a fixed answer and remembers the prompts it got
function fakeAi(reply) {
  const prompts = [];
  return {
    prompts,
    isConfigured: true,
    complete: async (prompt) => {
      prompts.push(prompt);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

test("uses the AI's lines, one per roll", async () => {
  const ai = fakeAi('[["Italy smashes through!"]]');
  const events = [roll('IT', 'VA', 1), { type: 'CONQUEST', playerId: 'IT', payload: { to: 'VA', bonus: 2 } }];

  await new CommentaryService(ai).annotate(events, game);

  assert.equal(events[0].commentary, 'Italy smashes through!');
  assert.match(ai.prompts[0], /Italy attacks Holy See/);
  assert.match(ai.prompts[0], /6v2/);
  assert.match(ai.prompts[0], /Holy See is conquered/);
});

test('several battles go to the AI in a single request', async () => {
  const ai = fakeAi('```json\n[["Line A1", "Line A2"], ["Line B1"]]\n```'); // code fences are fine
  const events = [
    { type: 'ATTACK_START', playerId: 'IT', payload: {} },
    roll('IT', 'VA', 1), roll('IT', 'VA', 2),
    { type: 'TURN_END', playerId: 'IT', payload: {} },
    { type: 'ATTACK_START', playerId: 'MM', payload: {} },
    roll('MM', 'LA', 1),
  ];

  await new CommentaryService(ai).annotate(events, game);

  assert.equal(ai.prompts.length, 1);
  assert.deepEqual(events.filter((e) => e.type === 'DICE_ROLL').map((e) => e.commentary), ['Line A1', 'Line A2', 'Line B1']);
});

test('falls back to ready-made lines when the AI fails', async () => {
  const events = [roll('IT', 'VA', 1, { defenderSoldiers: 3 })];
  await new CommentaryService(fakeAi(new Error('timeout'))).annotate(events, game);
  assert.match(events[0].commentary, /Italy|Holy See/);
});

test('falls back when the AI answers with something that is not a list', async () => {
  const events = [roll('IT', 'VA', 1, { defenderSoldiers: 3 })];
  await new CommentaryService(fakeAi('Sure! Here is some commentary...')).annotate(events, game);
  assert.ok(events[0].commentary.length > 10);
});

test('works with no AI set up at all, without trying to call it', async () => {
  const ai = { ...fakeAi('[]'), isConfigured: false };
  const events = [roll('IT', 'VA', 1, { attackerLosses: 0, defenderLosses: 0, pairs: [{ attack: 3, defend: 3, winner: 'tie' }] })];

  await new CommentaryService(ai).annotate(events, game);

  assert.equal(ai.prompts.length, 0);
  assert.match(events[0].commentary, /tie|Stalemate|even/i);
});

test('moves without dice rolls need no commentary', async () => {
  const ai = fakeAi('[]');
  await new CommentaryService(ai).annotate([{ type: 'TURN_END', payload: {} }], game);
  assert.equal(ai.prompts.length, 0);
});