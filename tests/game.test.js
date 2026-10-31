import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/domain/Game.js';
import { BattleEngine } from '../src/domain/BattleEngine.js';
import { Dice } from '../src/domain/Dice.js';
import { GameRuleError } from '../src/domain/errors.js';

// Dice that roll these exact values, in order: attacker's dice first, then the defender's
const fixedDice = (...values) => {
  let i = 0;
  return new Dice(() => values[i++]);
};

// A small test board: the human 'H' and NPCs 'N1'...'N9', each owning one country with the same ID.
// Every country has soldier value 4 and starts with 4 soldiers unless a test changes it.
const IDS = ['H', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'];

function makeGame({ soldiers = {}, owners = {}, eliminated = [], dice = [], ...rest } = {}) {
  const data = {
    _id: 'game1',
    status: 'active',
    round: 1,
    phase: 'PLANNING',
    currentTurnIndex: 0,
    turnOrder: IDS,
    players: IDS.map((id, i) => ({
      playerId: id,
      type: i === 0 ? 'human' : 'npc',
      name: i === 0 ? 'Home' : `NPC ${id}`,
      color: '#000000',
      eliminated: eliminated.includes(id),
    })),
    territories: IDS.map((id) => ({
      iso2: id,
      name: `Land ${id}`,
      soldierValue: 4,
      ownerPlayerId: owners[id] ?? id,
      soldiers: soldiers[id] ?? 4,
    })),
    activeAttack: null,
    pendingReinforcements: 0,
    attackUsed: false,
    winnerPlayerId: null,
    eventSeq: 1,
    ...rest,
  };
  return new Game(data, new BattleEngine(fixedDice(...dice)));
}

const territory = (game, iso2) => game.territories.find((t) => t.iso2 === iso2);
const eventTypes = (game) => game.pullNewEvents().map((event) => event.type);

test("the brief's battle example plays out on the board", () => {
  const game = makeGame({ soldiers: { H: 10, N1: 2 }, dice: [1, 4, 2, 3] });
  game.startAttack('H', 'H', 'N1');
  game.rollAttack('H');

  assert.equal(territory(game, 'H').soldiers, 9);
  assert.equal(territory(game, 'N1').soldiers, 1);
  assert.equal(game.phase, 'ATTACKING'); // the attack carries on until the player stops or it ends
});

test('conquering gives max(2, value / 2) soldiers, then you choose how many more to move in', () => {
  const game = makeGame({ soldiers: { H: 5, N1: 1 }, dice: [6, 1] });
  game.startAttack('H', 'H', 'N1');
  game.rollAttack('H');

  assert.equal(territory(game, 'N1').ownerPlayerId, 'H');
  assert.equal(territory(game, 'N1').soldiers, 2); // max(2, floor(4 / 2))
  assert.equal(game.phase, 'CONQUEST_MOVE');

  game.conquestMove('H', 3);
  assert.equal(territory(game, 'H').soldiers, 2);
  assert.equal(territory(game, 'N1').soldiers, 5);
  assert.equal(game.currentPlayer.playerId, 'N2'); // N1 lost its only country, so it's skipped

  const types = eventTypes(game);
  assert.ok(types.includes('CONQUEST'));
  assert.ok(types.includes('ELIMINATION'));
});

test('after a conquest, 1 soldier must stay in the attacking country', () => {
  const game = makeGame({ soldiers: { H: 5, N1: 1 }, dice: [6, 1] });
  game.startAttack('H', 'H', 'N1');
  game.rollAttack('H');
  assert.throws(() => game.conquestMove('H', 5), GameRuleError);
});

test('an attack fails when the attacker is down to 1 soldier, and the turn ends', () => {
  const game = makeGame({ soldiers: { H: 2, N1: 4 }, dice: [1, 6] });
  game.startAttack('H', 'H', 'N1');
  game.rollAttack('H');

  assert.equal(territory(game, 'H').soldiers, 1);
  assert.equal(territory(game, 'H').ownerPlayerId, 'H'); // keeps its country
  assert.equal(territory(game, 'N1').soldiers, 4);
  assert.equal(game.currentPlayer.playerId, 'N1');
  assert.ok(eventTypes(game).includes('ATTACK_FAILED'));
});

test('stopping an attack ends the turn and keeps the soldiers where they are', () => {
  const game = makeGame({ soldiers: { H: 10, N1: 5 } });
  game.startAttack('H', 'H', 'N1');
  game.stopAttack('H');

  assert.equal(territory(game, 'H').soldiers, 10);
  assert.equal(game.currentPlayer.playerId, 'N1');
});

test("you can't attack your own country, or attack with only 1 soldier", () => {
  const ownsTwo = makeGame({ owners: { N1: 'H' } });
  assert.throws(() => ownsTwo.startAttack('H', 'H', 'N1'), GameRuleError);

  const tooSmall = makeGame({ soldiers: { H: 1 } });
  assert.throws(() => tooSmall.startAttack('H', 'H', 'N2'), GameRuleError);
});

test('transfers leave at least 1 soldier behind and are blocked during an attack', () => {
  const game = makeGame({ owners: { N1: 'H' }, soldiers: { H: 5, N1: 1 } });
  assert.throws(() => game.transfer('H', 'H', 'N1', 5), GameRuleError);

  game.transfer('H', 'H', 'N1', 4);
  assert.equal(territory(game, 'H').soldiers, 1);
  assert.equal(territory(game, 'N1').soldiers, 5);

  game.startAttack('H', 'N1', 'N2');
  assert.throws(() => game.transfer('H', 'N1', 'H', 1), GameRuleError);
});

test("you can't transfer to a country you don't own", () => {
  const game = makeGame({ soldiers: { H: 5 } });
  assert.throws(() => game.transfer('H', 'H', 'N1', 2), GameRuleError);
});

test('only the player whose turn it is can act', () => {
  const game = makeGame();
  assert.throws(() => game.startAttack('N1', 'N1', 'H'), GameRuleError);
});

test('round 1 has no reinforcements; from round 2 you get 2 per country', () => {
  const game = makeGame();
  for (const id of IDS) game.endTurn(id); // everyone skips round 1

  assert.equal(game.round, 2);
  assert.equal(game.currentPlayer.playerId, 'H');
  assert.equal(game.phase, 'REINFORCE');
  assert.equal(game.pendingReinforcements, 2);

  assert.throws(() => game.reinforce('H', [{ iso2: 'H', count: 1 }]), GameRuleError); // must place all 2
  game.reinforce('H', [{ iso2: 'H', count: 2 }]);
  assert.equal(territory(game, 'H').soldiers, 6);
  assert.equal(game.phase, 'PLANNING');
});

test('reinforcements must be placed first, and only on your own countries', () => {
  const game = makeGame({ round: 2, phase: 'REINFORCE', pendingReinforcements: 2 });
  assert.throws(() => game.startAttack('H', 'H', 'N1'), GameRuleError);
  assert.throws(() => game.endTurn('H'), GameRuleError);
  assert.throws(() => game.reinforce('H', [{ iso2: 'N1', count: 2 }]), GameRuleError);
  assert.equal(territory(game, 'N1').soldiers, 4); // nothing changed
});

test('eliminated players are skipped', () => {
  const game = makeGame({ owners: { N1: 'N2' }, eliminated: ['N1'] });
  game.endTurn('H');
  assert.equal(game.currentPlayer.playerId, 'N2');
});

test('conquering the last country wins the game', () => {
  const others = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8'];
  const game = makeGame({
    owners: Object.fromEntries(others.map((id) => [id, 'H'])),
    eliminated: others,
    soldiers: { H: 5, N9: 1 },
    dice: [6, 1],
  });
  game.startAttack('H', 'H', 'N9');
  game.rollAttack('H');

  assert.equal(game.status, 'won');
  assert.equal(game.phase, 'GAME_OVER');
  assert.equal(game.winnerPlayerId, 'H');
  assert.ok(eventTypes(game).includes('GAME_WON'));
  assert.throws(() => game.endTurn('H'), GameRuleError); // nothing more can happen
});

test('losing your last country ends the game', () => {
  const game = makeGame({ currentTurnIndex: 1, soldiers: { N1: 5, H: 1 }, dice: [6, 1] });
  game.startAttack('N1', 'N1', 'H');
  game.rollAttack('N1');

  assert.equal(game.status, 'lost');
  assert.equal(game.phase, 'GAME_OVER');
  assert.ok(eventTypes(game).includes('GAME_LOST'));
});

test('events are numbered in order, carrying on from the saved count', () => {
  const game = makeGame();
  game.startAttack('H', 'H', 'N1');
  game.stopAttack('H');

  const events = game.pullNewEvents();
  assert.deepEqual(events.map((e) => e.seq), [2, 3, 4, 5]);
  assert.deepEqual(events.map((e) => e.type), ['ATTACK_START', 'ATTACK_STOPPED', 'TURN_END', 'TURN_START']);
});

test('saving and loading keeps the game exactly the same', () => {
  const game = makeGame({ soldiers: { H: 10, N1: 2 }, dice: [1, 4, 2, 3] });
  game.startAttack('H', 'H', 'N1');
  game.rollAttack('H');

  const saved = game.toDocument();
  const reloaded = new Game(saved);
  assert.deepEqual(reloaded.toDocument(), saved);
});

test("the board can be read but not changed from outside", () => {
  const game = makeGame();
  game.territories[0].soldiers = 999; // changes a copy only
  assert.equal(territory(game, 'H').soldiers, 4);
});
