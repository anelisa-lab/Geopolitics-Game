import { NpcStrategy } from '../ai/NpcStrategy.js';

const MAX_NPC_TURNS = 50;     // safety nets, so a bug can never loop forever
const MAX_ROLLS_PER_ATTACK = 200;

// Plays every NPC turn until it's the human's turn again (or the game ends).
// Each decision is recorded with its explanation before it's carried out,
// so the player can follow what each NPC did and why.
export class NpcTurnRunner {
  #strategy;

  constructor(strategy = new NpcStrategy()) {
    this.#strategy = strategy;
  }

  runUntilHumanTurn(game) {
    let turns = 0;
    while (!game.isOver && game.currentPlayer.isNpc && turns < MAX_NPC_TURNS) {
      this.#playTurn(game, game.currentPlayer.playerId);
      turns++;
    }
  }

  #playTurn(game, npcId) {
    const strategy = this.#strategy;

    // 1. Reinforcements (from round 2)
    if (game.phase === 'REINFORCE') {
      const plan = strategy.planReinforcements(game, npcId);
      game.recordDecision(npcId, 'reinforce', plan.justification);
      game.reinforce(npcId, plan.allocations);
    }

    // 2. Move spare soldiers towards the planned attack
    const transfer = strategy.planTransfer(game, npcId);
    if (transfer) {
      game.recordDecision(npcId, 'transfer', transfer.justification);
      game.transfer(npcId, transfer.from, transfer.to, transfer.count);
    }

    // 3. Attack, or skip
    const choice = strategy.chooseAttack(game, npcId);
    game.recordDecision(npcId, choice.attack ? 'attack' : 'skip', choice.justification);
    if (!choice.attack) {
      game.endTurn(npcId);
      return;
    }

    const startingSoldiers = game.territories.find((t) => t.iso2 === choice.from).soldiers;
    game.startAttack(npcId, choice.from, choice.to);

    // 4. Roll until it's won, lost, or not worth continuing
    let rolls = 0;
    while (game.phase === 'ATTACKING') {
      game.rollAttack(npcId);
      rolls++;
      if (game.phase !== 'ATTACKING') break; // conquered, or failed (turn already over)

      const next = strategy.shouldContinue(game, choice.from, choice.to, startingSoldiers);
      if (!next.continue || rolls >= MAX_ROLLS_PER_ATTACK) {
        game.recordDecision(npcId, 'stop', next.justification ?? 'Stopping: this battle has gone on long enough.');
        game.stopAttack(npcId);
      }
    }

    // 5. After a conquest, decide how many soldiers move in
    if (game.phase === 'CONQUEST_MOVE') {
      const move = strategy.planConquestMove(game, npcId, choice.from, choice.to);
      game.recordDecision(npcId, 'move', move.justification);
      game.conquestMove(npcId, move.count);
    }
  }
}

export const npcTurnRunner = new NpcTurnRunner();
