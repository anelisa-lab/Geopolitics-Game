import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/domain/Game.js';
import { NpcTurnRunner } from '../src/services/NpcTurnRunner.js';
import { shuffle } from '../src/domain/random.js';

// Plays whole games with real random dice: the human just places reinforcements and
// ends their turn, and the NPCs play for real. Any illegal NPC move would throw an error.
function playOneGame(runner) {
  const ids = ['H', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'];
  const game = new Game({
    status: 'active', round: 1, phase: 'PLANNING', currentTurnIndex: 0, eventSeq: 1,
    turnOrder: shuffle(ids),
    players: ids.map((id, i) => ({ playerId: id, type: i === 0 ? 'human' : 'npc', name: id, color: '#000000' })),
    // The human gets a mid-sized country (6); the NPCs range from 2 to 9
    territories: ids.map((id, i) => {
      const value = i === 0 ? 6 : i + 1 > 9 ? 9 : i + 1;
      return { iso2: id, name: id, soldierValue: value, ownerPlayerId: id, soldiers: value };
    }),
  });

  const events = [];
  let rounds = 0;
  runner.runUntilHumanTurn(game);
  events.push(...game.pullNewEvents());
  while (!game.isOver && rounds < 300) {
    if (game.phase === 'REINFORCE') {
      game.reinforce('H', [{ iso2: game.territoriesOf('H')[0].iso2, count: game.pendingReinforcements }]);
    }
    game.endTurn('H');
    runner.runUntilHumanTurn(game);
    events.push(...game.pullNewEvents());
    rounds++;
  }
  return { game, events };
}

test('NPCs only ever make legal moves, and a passive human is eventually conquered', () => {
  const runner = new NpcTurnRunner();
  for (let i = 0; i < 25; i++) {
    const { game } = playOneGame(runner);
    assert.equal(game.status, 'lost', `game ${i} did not finish`);
  }
});

test('every NPC decision comes with an explanation', () => {
  const { events } = playOneGame(new NpcTurnRunner());
  const decisions = events.filter((e) => e.type === 'NPC_DECISION');

  assert.ok(decisions.length > 0);
  for (const decision of decisions) {
    assert.equal(typeof decision.justification, 'string');
    assert.ok(decision.justification.length > 10);
  }
});

test('NPCs attack, skip, and sometimes stop: they make real choices', () => {
  const actions = new Set();
  for (let i = 0; i < 5; i++) {
    for (const e of playOneGame(new NpcTurnRunner()).events) {
      if (e.type === 'NPC_DECISION') actions.add(e.payload.action);
    }
  }
  for (const action of ['reinforce', 'attack', 'skip', 'move']) assert.ok(actions.has(action), `never chose to ${action}`);
});
