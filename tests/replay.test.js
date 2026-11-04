import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/domain/Game.js';
import { NpcTurnRunner } from '../src/services/NpcTurnRunner.js';
import { buildGameView } from '../src/services/gameView.js';
import { applyEvent } from '../src/public/js/game/replay.js';
import { shuffle } from '../src/domain/random.js';

// What the server would send the browser for this game
const viewOf = (game) => buildGameView({ ...game.toDocument(), _id: 'game1', ownerId: 'owner1', title: 'Test' }, 'owner1');

// The parts of the board the player sees
const boardOf = (view) => ({
  round: view.round,
  phase: view.phase,
  status: view.status,
  currentPlayer: view.currentPlayer.playerId,
  isHumanTurn: view.isHumanTurn,
  pendingReinforcements: view.pendingReinforcements,
  activeAttack: view.activeAttack,
  territories: view.territories.map((t) => [t.iso2, t.ownerPlayerId, t.ownerName, t.soldiers]),
  players: view.players.map((p) => [p.playerId, p.eliminated, p.territories, p.soldiers, p.isCurrent]),
});

test("replaying the NPCs' moves one by one ends on exactly the server's board", () => {
  const ids = ['H', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'];
  const runner = new NpcTurnRunner();

  for (let g = 0; g < 10; g++) {
    const game = new Game({
      status: 'active', round: 1, phase: 'PLANNING', currentTurnIndex: 0, eventSeq: 1,
      turnOrder: shuffle(ids),
      players: ids.map((id, i) => ({ playerId: id, type: i === 0 ? 'human' : 'npc', name: `P ${id}`, color: '#000000' })),
      territories: ids.map((id, i) => ({ iso2: id, name: `Land ${id}`, soldierValue: Math.min(i + 2, 9), ownerPlayerId: id, soldiers: Math.min(i + 2, 9) })),
    });
    runner.runUntilHumanTurn(game);
    game.pullNewEvents();

    // Play up to 40 rounds, checking the replay after every one
    for (let round = 0; round < 40 && !game.isOver; round++) {
      const before = viewOf(game);
      if (game.phase === 'REINFORCE') {
        game.reinforce('H', [{ iso2: game.territoriesOf('H')[0].iso2, count: game.pendingReinforcements }]);
      }
      game.endTurn('H');
      runner.runUntilHumanTurn(game);

      const replayed = structuredClone(before);
      for (const event of game.pullNewEvents()) applyEvent(replayed, event);
      assert.deepEqual(boardOf(replayed), boardOf(viewOf(game)));
    }
  }
});
