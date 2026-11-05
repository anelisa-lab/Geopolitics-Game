// FOR TESTING ONLY: sets up one of your games so you are one conquest away from winning,
// so you can check the victory screen without playing a whole game.
// It ignores the game's rules, so only use it on a test game.
//
// Usage: node scripts/almostWin.js GAME_ID   (the long ID at the end of the game's address)
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { gameRepository } from '../src/repositories/GameRepository.js';

const gameId = process.argv[2];
if (!/^[a-f0-9]{24}$/i.test(gameId ?? '')) {
  console.error('Usage: node scripts/almostWin.js GAME_ID  (copy the long ID from the end of the game page address)');
  process.exit(1);
}

await connectDB(env.mongoUri);
const game = await gameRepository.findById(gameId);

if (!game) {
  console.error('No game with that ID.');
} else if (game.status !== 'active') {
  console.error('That game is already over. Pick a game that is still in progress.');
} else {
  const human = game.players.find((player) => player.type === 'human');
  const enemies = game.territories.filter((t) => t.ownerPlayerId !== human.playerId);
  const last = enemies.at(-1);

  // Hand every other country to the player, leave one enemy country with a single soldier
  for (const territory of game.territories) {
    if (territory === last) territory.soldiers = 1;
    else if (territory.ownerPlayerId !== human.playerId) {
      territory.ownerPlayerId = human.playerId;
      territory.soldiers = 3;
    }
  }
  game.territories.find((t) => t.ownerPlayerId === human.playerId).soldiers = 10;

  for (const player of game.players) {
    player.eliminated = player.type === 'npc' && !game.territories.some((t) => t.ownerPlayerId === player.playerId);
  }

  // Make it the player's turn, ready to attack
  game.currentTurnIndex = game.turnOrder.indexOf(human.playerId);
  game.phase = 'PLANNING';
  game.activeAttack = null;
  game.attackUsed = false;
  game.pendingReinforcements = 0;

  await gameRepository.save(game);
  console.log(`Done. Only ${last.name} is left, with 1 soldier. Refresh the game page and attack it to win.`);
}

await disconnectDB();