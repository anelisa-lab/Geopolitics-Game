import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireOwner, requireHumanTurn } from '../src/middleware/gameAccess.js';

const makeGame = (overrides = {}) => ({
  ownerId: 'owner1',
  status: 'active',
  players: [{ playerId: 'p1', type: 'human' }, { playerId: 'p2', type: 'npc' }],
  turnOrder: ['p1', 'p2'],
  currentTurnIndex: 0,
  ...overrides,
});

// Runs a middleware and returns 'next' if it let the request through, or the error it raised
function run(middleware, req) {
  let outcome = 'not called';
  middleware(req, {}, (err) => { outcome = err ?? 'next'; });
  return outcome;
}

test('the owner can act on their game', () => {
  assert.equal(run(requireOwner, { game: makeGame(), session: { user: { id: 'owner1' } } }), 'next');
});

test('another logged-in user is refused with 403', () => {
  assert.equal(run(requireOwner, { game: makeGame(), session: { user: { id: 'someone-else' } } }).status, 403);
});

test('a visitor who is not logged in is refused', () => {
  assert.equal(run(requireOwner, { game: makeGame(), session: {} }).status, 403);
});

test("the human can act on their own turn", () => {
  assert.equal(run(requireHumanTurn, { game: makeGame() }), 'next');
});

test("the human can't act on an NPC's turn", () => {
  assert.equal(run(requireHumanTurn, { game: makeGame({ currentTurnIndex: 1 }) }).status, 409);
});

test("nobody can act once the game is over", () => {
  assert.equal(run(requireHumanTurn, { game: makeGame({ status: 'won' }) }).status, 409);
});