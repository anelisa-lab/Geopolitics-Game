import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/domain/Game.js';
import { NpcStrategy, DIFFICULTIES } from '../src/ai/NpcStrategy.js';
import { NpcTurnRunner } from '../src/services/NpcTurnRunner.js';
import { createGameSchema } from '../src/validators/gameSchemas.js';

const IDS = ['H', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'];

// NPC N1 against one weaker country (N5); everyone else is far too strong to attack
function boardWithOneTarget(attackers, defenders) {
  return new Game({
    status: 'active', round: 2, phase: 'PLANNING', currentTurnIndex: 1, turnOrder: IDS, eventSeq: 1,
    players: IDS.map((id, i) => ({ playerId: id, type: i === 0 ? 'human' : 'npc', name: id, color: '#000000' })),
    territories: IDS.map((id) => ({
      iso2: id, name: `Land ${id}`, soldierValue: 4, ownerPlayerId: id,
      soldiers: id === 'N1' ? attackers : id === 'N5' ? defenders : 30,
    })),
  });
}

const choose = (level, attackers, defenders) =>
  new NpcStrategy(DIFFICULTIES[level]).chooseAttack(boardWithOneTarget(attackers, defenders), 'N1');

test('Easy NPCs skip a fair-but-risky attack that Normal NPCs take', () => {
  // 5 vs 3 is about a 66% chance
  assert.equal(choose('normal', 5, 3).attack, true);
  assert.equal(choose('easy', 5, 3).attack, false);
});

test('Hard NPCs take an even-odds attack that Normal NPCs skip', () => {
  // 2 vs 1 is exactly 50%
  assert.equal(choose('normal', 2, 1).attack, false);
  assert.equal(choose('hard', 2, 1).attack, true);
});

test("every level attacks when it's a sure thing", () => {
  for (const level of ['easy', 'normal', 'hard']) assert.equal(choose(level, 10, 1).attack, true, level);
});

test("the game's difficulty decides how its NPCs play", () => {
  const runner = new NpcTurnRunner();
  const decisions = (level) => {
    const game = boardWithOneTarget(2, 1);
    runner.runUntilHumanTurn(game, level);
    return game.pullNewEvents().filter((e) => e.type === 'NPC_DECISION' && e.playerId === 'N1').map((e) => e.payload.action);
  };
  assert.ok(decisions('hard').includes('attack'));
  assert.ok(!decisions('easy').includes('attack'));
});

test('a game without a difficulty (made before levels existed) plays as Normal', () => {
  const runner = new NpcTurnRunner();
  const game = boardWithOneTarget(2, 1);
  runner.runUntilHumanTurn(game, undefined);
  const n1 = game.pullNewEvents().filter((e) => e.type === 'NPC_DECISION' && e.playerId === 'N1').map((e) => e.payload.action);
  assert.ok(n1.includes('skip')); // Normal skips a 50% attack
});

test('new games are Normal unless another level is chosen, and odd values are refused', () => {
  assert.equal(createGameSchema.parse({ iso2: 'ZA' }).difficulty, 'normal');
  assert.equal(createGameSchema.parse({ iso2: 'ZA', difficulty: 'hard' }).difficulty, 'hard');
  assert.equal(createGameSchema.safeParse({ iso2: 'ZA', difficulty: 'impossible' }).success, false);
});
