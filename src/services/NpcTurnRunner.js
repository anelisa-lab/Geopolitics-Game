// Plays NPC turns until it's the human's turn again (or the game ends).
// TEMPORARY: for now NPCs only place their reinforcements and skip their turn,
// so you can test your own moves. Day 5 replaces this with an NPC that plays to win.
const MAX_NPC_TURNS = 50; // safety net so a bug can never loop forever

export class NpcTurnRunner {
  runUntilHumanTurn(game) {
    let turns = 0;
    while (!game.isOver && game.currentPlayer.isNpc && turns < MAX_NPC_TURNS) {
      const npcId = game.currentPlayer.playerId;

      if (game.phase === 'REINFORCE') {
        const strongest = game.territoriesOf(npcId).sort((a, b) => b.soldiers - a.soldiers)[0];
        game.reinforce(npcId, [{ iso2: strongest.iso2, count: game.pendingReinforcements }]);
      }

      game.endTurn(npcId);
      turns++;
    }
  }
}

export const npcTurnRunner = new NpcTurnRunner();
