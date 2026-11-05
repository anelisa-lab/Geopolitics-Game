import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameService } from '../src/services/GameService.js';
import { summarizeBattles } from '../src/services/gameStats.js';
import { BattleEngine } from '../src/domain/BattleEngine.js';
import { Dice } from '../src/domain/Dice.js';

const fixedDice = (...values) => {
  let i = 0;
  return new Dice(() => values[i++]);
};

const IDS = ['H', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'];

// A saved game: the human 'H' owns the countries listed in `humanOwns`; everyone else owns their own
function fakeGameDocument({ humanOwns = ['H'], soldiers = {}, current = 'H' } = {}) {
  return {
    _id: 'game1', ownerId: 'owner1', title: 'Test', status: 'active', round: 5, phase: 'PLANNING',
    turnOrder: IDS, currentTurnIndex: IDS.indexOf(current), eventSeq: 1,
    players: IDS.map((id, i) => ({
      playerId: id, type: i === 0 ? 'human' : 'npc', name: id, color: '#000000',
      eliminated: id !== 'H' && humanOwns.includes(id),
    })),
    territories: IDS.map((id) => ({
      iso2: id, name: `Land ${id}`, soldierValue: 4, ownerPlayerId: humanOwns.includes(id) ? 'H' : id, soldiers: soldiers[id] ?? 4,
    })),
    set(update) { Object.assign(this, update); },
    toObject() { return structuredClone({ ...this, set: undefined, toObject: undefined }); },
  };
}

function makeService({ dice = [], npcs = { runUntilHumanTurn: () => {} } } = {}) {
  const results = [];
  const service = new GameService({
    games: { save: async (doc) => doc },
    events: { append: async (gameId, events) => events },
    users: { recordResult: async (userId, result) => results.push({ userId, result }) },
    engine: new BattleEngine(fixedDice(...dice)),
    npcs,
  });
  return { service, results };
}

test("winning the game adds a win to the player's record", async () => {
  // The human owns everything except N9, which has 1 soldier left
  const doc = fakeGameDocument({ humanOwns: IDS.slice(0, 9), soldiers: { H: 6, N9: 1 } });
  const { service, results } = makeService({ dice: [6, 1] });

  await service.startAttack(doc, { from: 'H', to: 'N9' });
  assert.deepEqual(results, []); // not over yet
  await service.rollAttack(doc);

  assert.equal(doc.status, 'won');
  assert.deepEqual(results, [{ userId: 'owner1', result: 'won' }]);
});

test("losing your last country adds a loss to the player's record", async () => {
  // When the human ends their turn, NPC N1 attacks and takes the human's only country
  const npcs = {
    runUntilHumanTurn: (game) => {
      if (game.currentPlayer.playerId !== 'N1') return;
      game.reinforce('N1', [{ iso2: 'N1', count: game.pendingReinforcements }]); // the rules: reinforce first
      game.startAttack('N1', 'N1', 'H');
      game.rollAttack('N1');
    },
  };
  const doc = fakeGameDocument({ soldiers: { H: 1, N1: 6 } });
  const { service, results } = makeService({ dice: [6, 1], npcs });

  await service.endTurn(doc);

  assert.equal(doc.status, 'lost');
  assert.deepEqual(results, [{ userId: 'owner1', result: 'lost' }]);
});

test('ordinary moves do not touch the record', async () => {
  const doc = fakeGameDocument();
  const { service, results } = makeService();
  await service.endTurn(doc);
  assert.deepEqual(results, []);
});

test('the battle summary adds up attacks, conquests, rolls and losses', () => {
  const roll = (attackerLosses, defenderLosses) => ({ type: 'DICE_ROLL', payload: { attackerLosses, defenderLosses } });
  const stats = summarizeBattles([
    { type: 'ATTACK_START' }, roll(1, 1), roll(0, 2), { type: 'CONQUEST' },
    { type: 'ATTACK_START' }, roll(2, 0),
  ]);
  assert.deepEqual(stats, { attacks: 2, conquests: 1, rolls: 3, enemiesDefeated: 3, soldiersLost: 3 });
});

test("the game summary uses only the player's own events", async () => {
  const asked = [];
  const service = new GameService({
    events: {
      findForPlayer: async (gameId, playerId, types) => {
        asked.push({ gameId, playerId, types });
        return [{ type: 'ATTACK_START' }, { type: 'DICE_ROLL', payload: { attackerLosses: 0, defenderLosses: 1 } }, { type: 'CONQUEST' }];
      },
    },
  });
  const doc = { ...fakeGameDocument({ humanOwns: ['H', 'N1'] }), status: 'lost' };

  const summary = await service.summarizeGame(doc);

  assert.equal(asked[0].playerId, 'H');
  assert.deepEqual(summary, { status: 'lost', rounds: 5, countriesHeld: 2, attacks: 1, conquests: 1, rolls: 1, enemiesDefeated: 1, soldiersLost: 0 });
});