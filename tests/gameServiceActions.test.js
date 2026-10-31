import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameService } from '../src/services/GameService.js';
import { BattleEngine } from '../src/domain/BattleEngine.js';
import { Dice } from '../src/domain/Dice.js';
import { GameRuleError } from '../src/domain/errors.js';

const fixedDice = (...values) => {
  let i = 0;
  return new Dice(() => values[i++]);
};

const IDS = ['H', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'];

function fakeGameDocument({ soldiers = {} } = {}) {
  return {
    _id: 'game1',
    ownerId: 'owner1',
    title: 'Test game',
    status: 'active',
    round: 1,
    phase: 'PLANNING',
    turnOrder: IDS,
    currentTurnIndex: 0,
    players: IDS.map((id, i) => ({
      playerId: id, type: i === 0 ? 'human' : 'npc', name: id, color: '#000000', eliminated: false,
    })),
    territories: IDS.map((id) => ({
      iso2: id, name: `Land ${id}`, soldierValue: 4, ownerPlayerId: id, soldiers: soldiers[id] ?? 4,
    })),
    activeAttack: null,
    pendingReinforcements: 0,
    attackUsed: false,
    winnerPlayerId: null,
    eventSeq: 1,
    set(update) { Object.assign(this, update); },
    toObject() { return structuredClone({ ...this, set: undefined, toObject: undefined }); },
  };
}

function makeService(dice = []) {
  const saved = [];
  const appended = [];
  const service = new GameService({
    games: { save: async (doc) => { saved.push(doc); return doc; } },
    events: { append: async (gameId, events) => { appended.push(...events); return events; } },
    engine: new BattleEngine(fixedDice(...dice)),
  });
  return { service, saved, appended };
}

test('a move is checked by the engine, then saved with its events', async () => {
  const { service, saved, appended } = makeService([1, 4, 2, 3]);
  const doc = fakeGameDocument({ soldiers: { H: 10, N1: 2 } });

  await service.startAttack(doc, { from: 'H', to: 'N1' });
  const events = await service.rollAttack(doc);

  assert.equal(saved.length, 2);
  assert.equal(events[0].type, 'DICE_ROLL');
  assert.deepEqual(appended.map((e) => e.type), ['ATTACK_START', 'DICE_ROLL']);
  assert.equal(doc.territories.find((t) => t.iso2 === 'H').soldiers, 9);
  assert.equal(doc.territories.find((t) => t.iso2 === 'N1').soldiers, 1);
});

test('a move that breaks the rules saves nothing', async () => {
  const { service, saved, appended } = makeService();
  const doc = fakeGameDocument();

  await assert.rejects(service.startAttack(doc, { from: 'H', to: 'H' }), GameRuleError);
  assert.equal(saved.length, 0);
  assert.equal(appended.length, 0);
});

test('after the human ends their turn, the NPCs play until it is the human\'s turn again', async () => {
  const { service, saved } = makeService();
  const doc = fakeGameDocument();

  await service.endTurn(doc);

  assert.equal(saved.length, 1); // one save for the whole round of NPC turns
  assert.equal(doc.turnOrder[doc.currentTurnIndex], 'H');
  assert.equal(doc.round, 2);
  assert.equal(doc.phase, 'REINFORCE'); // round 2: the human now has reinforcements to place
  assert.equal(doc.pendingReinforcements, 2);
});

test('events keep counting up across moves', async () => {
  const { service, appended } = makeService();
  const doc = fakeGameDocument();

  await service.endTurn(doc);
  await service.reinforce(doc, [{ iso2: 'H', count: 2 }]);

  const seqs = appended.map((e) => e.seq);
  assert.deepEqual(seqs, seqs.map((_, i) => i + 2)); // 2, 3, 4... with no gaps
  assert.equal(doc.eventSeq, seqs.at(-1));
});
