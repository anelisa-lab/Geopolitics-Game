// Plays many games without a database or browser, to check the NPCs behave sensibly.
// The "human" here only places reinforcements and ends their turn, so the NPCs do all the fighting.
// Run with: node scripts/simulate.js 200
import { Game } from '../src/domain/Game.js';
import { NpcTurnRunner } from '../src/services/NpcTurnRunner.js';
import { shuffle } from '../src/domain/random.js';

const GAMES = Number(process.argv[2] ?? 100);
const runner = new NpcTurnRunner();
const ids = ['H', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'];
const decisions = {};
const roundsPlayed = [];
let errors = 0;

for (let n = 0; n < GAMES; n++) {
  const game = new Game({
    status: 'active', round: 1, phase: 'PLANNING', currentTurnIndex: 0, eventSeq: 1,
    turnOrder: shuffle(ids),
    players: ids.map((id, i) => ({ playerId: id, type: i === 0 ? 'human' : 'npc', name: id, color: '#000000' })),
    territories: ids.map((id, i) => {
      const value = i === 0 ? 6 : Math.min(i + 1, 9);
      return { iso2: id, name: id, soldierValue: value, ownerPlayerId: id, soldiers: value };
    }),
  });

  try {
    runner.runUntilHumanTurn(game);
    while (!game.isOver && game.round < 300) {
      if (game.phase === 'REINFORCE') {
        game.reinforce('H', [{ iso2: game.territoriesOf('H')[0].iso2, count: game.pendingReinforcements }]);
      }
      game.endTurn('H');
      runner.runUntilHumanTurn(game);
      for (const event of game.pullNewEvents()) {
        if (event.type === 'NPC_DECISION') decisions[event.payload.action] = (decisions[event.payload.action] ?? 0) + 1;
      }
    }
    roundsPlayed.push(game.round);
  } catch (err) {
    errors++;
    console.error(`Game ${n + 1}: ${err.message}`);
  }
}

const average = roundsPlayed.reduce((a, b) => a + b, 0) / roundsPlayed.length;
console.log(`Games played:        ${GAMES}`);
console.log(`Illegal moves:       ${errors}`);
console.log(`Average game length: ${average.toFixed(1)} rounds (shortest ${Math.min(...roundsPlayed)}, longest ${Math.max(...roundsPlayed)})`);
console.log('NPC decisions:', decisions);
