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

function makeService() {
  const appendedEvents = [];
  const service = new GameService({
    countries: { findAll: async () => fakeCountries },
    games: { create: async (data) => ({ ...data, _id: 'game1' }) },
    events: { append: async (gameId, events) => { appendedEvents.push(...events); return events; } },
  });
  return { service, appendedEvents };
}

test('a game has 10 different countries, including the one the player picked', async () => {
  const { service } = makeService();
  const game = await service.createGame('owner1', { iso2: 'AE', title: '' });

  const codes = game.territories.map((territory) => territory.iso2);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.ok(codes.includes('AE'));
  assert.equal(game.territories.find((t) => t.iso2 === 'AE').ownerPlayerId, game.players.find((p) => p.type === 'human').playerId);
});

test('every country starts with its full soldier value', async () => {
  const { service } = makeService();
  const game = await service.createGame('owner1', { iso2: 'AA', title: '' });
  for (const territory of game.territories) assert.equal(territory.soldiers, territory.soldierValue);
});

test('there is 1 human and 9 NPCs, and everyone is in the turn order once', async () => {
  const { service } = makeService();
  const game = await service.createGame('owner1', { iso2: 'AA', title: '' });

  assert.equal(game.players.filter((p) => p.type === 'human').length, 1);
  assert.equal(game.players.filter((p) => p.type === 'npc').length, 9);
  assert.deepEqual([...game.turnOrder].sort(), game.players.map((p) => p.playerId).sort());
});

test('round 1 starts with no reinforcements and a GAME_CREATED event', async () => {
  const { service, appendedEvents } = makeService();
  const game = await service.createGame('owner1', { iso2: 'AA', title: '' });

  assert.equal(game.round, 1);
  assert.equal(game.phase, 'PLANNING');
  assert.equal(appendedEvents[0].type, 'GAME_CREATED');
});

test('an unknown country is rejected', async () => {
  const { service } = makeService();
  await assert.rejects(service.createGame('owner1', { iso2: 'ZZ', title: '' }), ValidationError);
});
