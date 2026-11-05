import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameService } from '../src/services/GameService.js';
import { ValidationError } from '../src/domain/errors.js';

// 30 made-up countries with codes AA, AB, AC...
const fakeCountries = Array.from({ length: 30 }, (_, i) => ({
  iso2: String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)),
  name: `Country ${i}`,
  soldierValue: (i % 9) + 1,
}));

// Behaves enough like a Mongoose document for the service: it can be read, updated and copied
function fakeDocument(data) {
  return {
    ...data,
    set(update) { Object.assign(this, update); },
    toObject() { return structuredClone({ ...this, set: undefined, toObject: undefined }); },
  };
}

function makeService() {
  const appendedEvents = [];
  let createdWith = null; // the game exactly as it was set up, before any NPC moved
  const service = new GameService({
    countries: { findAll: async () => fakeCountries },
    games: {
      create: async (data) => {
        createdWith = structuredClone(data);
        return fakeDocument({ ...data, _id: 'game1' });
      },
      save: async (doc) => doc,
    },
    events: { append: async (gameId, events) => { appendedEvents.push(...events); return events; } },
    users: { recordResult: async () => {} }, // a game can end before the human's first turn    
  });
  return { service, appendedEvents, setup: () => createdWith };
}

const humanOf = (game) => game.players.find((p) => p.type === 'human');

test('a game has 10 different countries, including the one the player picked', async () => {
  const { service } = makeService();
  const game = await service.createGame('owner1', { iso2: 'AE', title: '' });

  const codes = game.territories.map((territory) => territory.iso2);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.ok(codes.includes('AE'));
  assert.equal(game.territories.find((t) => t.iso2 === 'AE').ownerPlayerId, humanOf(game).playerId);
});

test('every country starts with its full soldier value', async () => {
  const { service, setup } = makeService();
  await service.createGame('owner1', { iso2: 'AA', title: '' });
  for (const territory of setup().territories) assert.equal(territory.soldiers, territory.soldierValue);
});

test('there is 1 human and 9 NPCs, and everyone is in the turn order once', async () => {
  const { service } = makeService();
  const game = await service.createGame('owner1', { iso2: 'AA', title: '' });

  assert.equal(game.players.filter((p) => p.type === 'human').length, 1);
  assert.equal(game.players.filter((p) => p.type === 'npc').length, 9);
  assert.deepEqual([...game.turnOrder].sort(), game.players.map((p) => p.playerId).sort());
});

test('round 1 starts with no reinforcements and a GAME_CREATED event', async () => {
  const { service, appendedEvents, setup } = makeService();
  await service.createGame('owner1', { iso2: 'AA', title: '' });

  assert.equal(setup().round, 1);
  assert.equal(setup().phase, 'PLANNING');
  assert.equal(appendedEvents[0].type, 'GAME_CREATED');
});

test('if an NPC goes first, the NPCs play until it is the human\'s turn', async () => {
  // The turn order is random, so try it many times. NPCs play to win, so a human who
  // starts with a tiny country can lose before their first turn: then the game is over
  for (let i = 0; i < 20; i++) {
    const { service } = makeService();
    const game = await service.createGame('owner1', { iso2: 'AC', title: '' });
    const humansTurn = game.turnOrder[game.currentTurnIndex] === humanOf(game).playerId;
    assert.ok(humansTurn || game.status === 'lost');
  }
});

test('an unknown country is rejected', async () => {
  const { service } = makeService();
  await assert.rejects(service.createGame('owner1', { iso2: 'ZZ', title: '' }), ValidationError);
});
