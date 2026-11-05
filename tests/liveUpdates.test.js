import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { setupGameSockets, notifyGameUpdated } from '../src/sockets/gameSocket.js';
import { GameService } from '../src/services/GameService.js';

const GAME_ID = 'a'.repeat(24);
let server;
let url;
const clients = [];

// A real Socket.IO server on a free port, just for these tests
before(async () => {
  server = http.createServer();
  setupGameSockets(new Server(server));
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://localhost:${server.address().port}`;
});

after(() => {
  for (const client of clients) client.close();
  server.close();
});

function viewer() {
  const client = connect(url, { transports: ['websocket'] });
  clients.push(client);
  return client;
}

const next = (client, eventName) => new Promise((resolve) => client.once(eventName, resolve));

test('watchers hear about a new move straight away', async () => {
  const watcher = viewer();
  const counted = next(watcher, 'viewers');
  watcher.emit('watch', GAME_ID);
  await counted; // now in the game's room

  const heard = next(watcher, 'game:updated');
  notifyGameUpdated(GAME_ID, 42);
  assert.deepEqual(await heard, { lastSeq: 42 });
});

test('everyone watching sees how many viewers there are', async () => {
  const first = viewer();
  const second = viewer();
  first.emit('watch', 'b'.repeat(24));
  await next(first, 'viewers');

  const updated = next(first, 'viewers');
  second.emit('watch', 'b'.repeat(24));
  assert.equal(await updated, 2);
});

test('watching a made-up game ID is ignored', async () => {
  const sneaky = viewer();
  let heard = false;
  sneaky.on('viewers', () => { heard = true; });
  sneaky.emit('watch', '../../admin');
  sneaky.emit('watch', { $gt: '' });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(heard, false);
});

test('a game move tells the watchers, with the newest event number', async () => {
  const notified = [];
  const doc = {
    _id: 'c'.repeat(24), ownerId: 'owner1', title: 'Test', status: 'active', round: 1, phase: 'PLANNING',
    turnOrder: ['H', 'N1'], currentTurnIndex: 0, eventSeq: 7,
    players: [{ playerId: 'H', type: 'human', name: 'H', color: '#000' }, { playerId: 'N1', type: 'npc', name: 'N1', color: '#111' }],
    territories: [
      { iso2: 'H', name: 'Home', soldierValue: 3, ownerPlayerId: 'H', soldiers: 3 },
      { iso2: 'N1', name: 'Away', soldierValue: 3, ownerPlayerId: 'N1', soldiers: 3 },
    ],
    set(update) { Object.assign(this, update); },
    toObject() { return structuredClone({ ...this, set: undefined, toObject: undefined }); },
  };
  const service = new GameService({
    games: { save: async (d) => d },
    events: { append: async (id, events) => events },
    npcs: { runUntilHumanTurn: () => {} },
    notify: (gameId, lastSeq) => notified.push({ gameId, lastSeq }),
  });

  await service.startAttack(doc, { from: 'H', to: 'N1' });
  assert.deepEqual(notified, [{ gameId: 'c'.repeat(24), lastSeq: 8 }]);
});