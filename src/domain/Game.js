import { BattleEngine } from './BattleEngine.js';
import { Territory } from './Territory.js';
import { playerFromDocument } from './Player.js';
import { GameRuleError } from './errors.js';
import { conquestBonus, reinforcementsFor } from './rules.js';

// What to tell a player who tries something in the wrong part of their turn
const PHASE_HINTS = {
  REINFORCE: 'Place your reinforcements first.',
  PLANNING: "You can't do that right now.",
  ATTACKING: 'Finish or stop your attack first.',
  CONQUEST_MOVE: 'First choose how many soldiers to move into the country you conquered.',
  GAME_OVER: 'This game is over.',
};

// One game of Geopolitics: holds the board and enforces every rule of a turn.
// It knows nothing about the database or web pages, so every rule can be unit-tested.
export class Game {
  #id;
  #status;
  #round;
  #phase;
  #turnOrder;
  #currentTurnIndex;
  #players;
  #territories;
  #activeAttack;
  #pendingReinforcements;
  #attackUsed;
  #winnerPlayerId;
  #eventSeq;
  #engine;
  #newEvents = [];

  constructor(data, engine = new BattleEngine()) {
    this.#id = data._id ? data._id.toString() : null;
    this.#status = data.status;
    this.#round = data.round;
    this.#phase = data.phase;
    this.#turnOrder = [...data.turnOrder];
    this.#currentTurnIndex = data.currentTurnIndex;
    this.#players = new Map(data.players.map((player) => [player.playerId, playerFromDocument(player)]));
    this.#territories = new Map(data.territories.map((territory) => [territory.iso2, new Territory(territory)]));
    this.#activeAttack = data.activeAttack ? { ...data.activeAttack } : null;
    this.#pendingReinforcements = data.pendingReinforcements ?? 0;
    this.#attackUsed = data.attackUsed ?? false;
    this.#winnerPlayerId = data.winnerPlayerId ?? null;
    this.#eventSeq = data.eventSeq ?? 0;
    this.#engine = engine;
  }

  // Accepts a Mongoose document or a plain object
  static fromDocument(doc, engine) {
    const data = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return new Game(data, engine);
  }

  // ---------- Reading the game ----------

  get id() { return this.#id; }
  get status() { return this.#status; }
  get round() { return this.#round; }
  get phase() { return this.#phase; }
  get pendingReinforcements() { return this.#pendingReinforcements; }
  get attackUsed() { return this.#attackUsed; }
  get winnerPlayerId() { return this.#winnerPlayerId; }
  get isOver() { return this.#status !== 'active'; }
  get activeAttack() { return this.#activeAttack ? { ...this.#activeAttack } : null; }
  get currentPlayer() { return this.#players.get(this.#turnOrder[this.#currentTurnIndex]); }

  // Copies, so code outside the class can look at the board but not change it
  get territories() { return [...this.#territories.values()].map((territory) => territory.toDocument()); }
  get players() { return [...this.#players.values()].map((player) => player.toDocument()); }

  territoriesOf(playerId) {
    return this.territories.filter((territory) => territory.ownerPlayerId === playerId);
  }

  ownedCount(playerId) {
    return this.territoriesOf(playerId).length;
  }

  // Events created since the last call, ready to be saved
  pullNewEvents() {
    const events = this.#newEvents;
    this.#newEvents = [];
    return events;
  }

  // ---------- Actions ----------

  reinforce(playerId, allocations) {
    this.#assertTurn(playerId);
    if (this.#phase !== 'REINFORCE') throw new GameRuleError('You have no reinforcements to place right now.');
    if (!Array.isArray(allocations) || allocations.length === 0) {
      throw new GameRuleError('Choose where to place your reinforcements.');
    }

    // Check everything first, so a bad request changes nothing
    const totals = new Map();
    for (const { iso2, count } of allocations) {
      if (!Number.isInteger(count) || count < 1) {
        throw new GameRuleError('Each country you reinforce must get a whole number of soldiers, at least 1.');
      }
      const territory = this.#territory(iso2);
      if (!territory.isOwnedBy(playerId)) {
        throw new GameRuleError(`You can only reinforce your own countries. ${territory.name} isn't yours.`);
      }
      totals.set(iso2, (totals.get(iso2) ?? 0) + count);
    }

    const placed = [...totals.values()].reduce((sum, count) => sum + count, 0);
    if (placed !== this.#pendingReinforcements) {
      throw new GameRuleError(`Place exactly ${this.#pendingReinforcements} soldiers. You placed ${placed}.`);
    }

    for (const [iso2, count] of totals) this.#territory(iso2).addSoldiers(count);
    this.#pendingReinforcements = 0;
    this.#phase = 'PLANNING';
    this.#emit('REINFORCE', { allocations: [...totals].map(([iso2, count]) => ({ iso2, count })) });
  }

  transfer(playerId, fromIso2, toIso2, count) {
    this.#assertTurn(playerId);
    this.#assertPhase('PLANNING');

    const from = this.#territory(fromIso2);
    const to = this.#territory(toIso2);
    if (!from.isOwnedBy(playerId) || !to.isOwnedBy(playerId)) {
      throw new GameRuleError('You can only move soldiers between your own countries.');
    }
    if (fromIso2 === toIso2) throw new GameRuleError('Choose two different countries.');
    if (!Number.isInteger(count) || count < 1) throw new GameRuleError('Move at least 1 soldier.');
    if (count > from.movableSoldiers()) {
      throw new GameRuleError(`${from.name} can move at most ${from.movableSoldiers()}, because 1 soldier must stay behind.`);
    }

    from.removeSoldiers(count);
    to.addSoldiers(count);
    this.#emit('TRANSFER', { from: fromIso2, to: toIso2, count });
  }

  startAttack(playerId, fromIso2, toIso2) {
    this.#assertTurn(playerId);
    this.#assertPhase('PLANNING');
    if (this.#attackUsed) throw new GameRuleError('You can only attack once per turn.');

    const from = this.#territory(fromIso2);
    const to = this.#territory(toIso2);
    if (!from.isOwnedBy(playerId)) throw new GameRuleError('Attack from one of your own countries.');
    if (to.isOwnedBy(playerId)) throw new GameRuleError("You can't attack your own country.");
    if (!from.canAttack()) throw new GameRuleError(`${from.name} needs at least 2 soldiers to attack.`);

    this.#activeAttack = { fromIso2, toIso2, rolls: 0 };
    this.#attackUsed = true;
    this.#phase = 'ATTACKING';
    this.#emit('ATTACK_START', {
      from: fromIso2,
      to: toIso2,
      defenderPlayerId: to.ownerPlayerId,
      attackerSoldiers: from.soldiers,
      defenderSoldiers: to.soldiers,
    });
  }

  rollAttack(playerId) {
    this.#assertTurn(playerId);
    this.#assertPhase('ATTACKING');

    const from = this.#territory(this.#activeAttack.fromIso2);
    const to = this.#territory(this.#activeAttack.toIso2);
    const result = this.#engine.roll(from.soldiers, to.soldiers);

    from.removeSoldiers(result.attackerLosses);
    to.removeSoldiers(result.defenderLosses);
    this.#activeAttack.rolls++;

    this.#emit('DICE_ROLL', {
      from: from.iso2,
      to: to.iso2,
      roll: this.#activeAttack.rolls,
      pairs: result.pairs,
      attackerLosses: result.attackerLosses,
      defenderLosses: result.defenderLosses,
      attackerSoldiers: from.soldiers,
      defenderSoldiers: to.soldiers,
    });

    if (to.soldiers === 0) {
      this.#conquer(from, to);
    } else if (from.soldiers === 1) {
      // Down to the last soldier: the attack fails, but the attacker keeps their country
      this.#emit('ATTACK_FAILED', { from: from.iso2, to: to.iso2 });
      this.#advanceTurn();
    }
    return result;
  }

  stopAttack(playerId) {
    this.#assertTurn(playerId);
    this.#assertPhase('ATTACKING');

    const from = this.#territory(this.#activeAttack.fromIso2);
    const to = this.#territory(this.#activeAttack.toIso2);
    this.#emit('ATTACK_STOPPED', {
      from: from.iso2,
      to: to.iso2,
      attackerSoldiers: from.soldiers,
      defenderSoldiers: to.soldiers,
    });
    this.#advanceTurn(); // stopping an attack ends the turn
  }

  conquestMove(playerId, count) {
    this.#assertTurn(playerId);
    this.#assertPhase('CONQUEST_MOVE');

    const from = this.#territory(this.#activeAttack.fromIso2);
    const to = this.#territory(this.#activeAttack.toIso2);
    if (!Number.isInteger(count) || count < 0) throw new GameRuleError('Choose 0 or more soldiers to move.');
    if (count > from.movableSoldiers()) {
      throw new GameRuleError(`You can move at most ${from.movableSoldiers()} soldiers from ${from.name}.`);
    }

    from.removeSoldiers(count);
    to.addSoldiers(count);
    this.#emit('CONQUEST_MOVE', { from: from.iso2, to: to.iso2, count });
    this.#advanceTurn();
  }

  // Skip: end the turn without attacking (or after transfers)
  endTurn(playerId) {
    this.#assertTurn(playerId);
    this.#assertPhase('PLANNING');
    this.#advanceTurn();
  }

  // Plain object for saving to MongoDB
  toDocument() {
    return {
      status: this.#status,
      round: this.#round,
      phase: this.#phase,
      turnOrder: [...this.#turnOrder],
      currentTurnIndex: this.#currentTurnIndex,
      players: this.players,
      territories: this.territories,
      activeAttack: this.activeAttack,
      pendingReinforcements: this.#pendingReinforcements,
      attackUsed: this.#attackUsed,
      winnerPlayerId: this.#winnerPlayerId,
      eventSeq: this.#eventSeq,
    };
  }

  // ---------- Private helpers ----------

  #conquer(from, to) {
    const attackerId = from.ownerPlayerId;
    const defenderId = to.ownerPlayerId;
    const bonus = conquestBonus(to.soldierValue);

    to.conquer(attackerId, bonus);
    this.#emit('CONQUEST', { from: from.iso2, to: to.iso2, defenderPlayerId: defenderId, bonus });

    if (this.ownedCount(defenderId) === 0) {
      const defender = this.#player(defenderId);
      defender.eliminate();
      this.#emit('ELIMINATION', { playerId: defenderId });
      if (!defender.isNpc) return this.#endGame('lost', null); // the human lost their last country
    }

    if (this.ownedCount(attackerId) === this.#territories.size) {
      return this.#endGame(this.#player(attackerId).isNpc ? 'lost' : 'won', attackerId);
    }

    this.#phase = 'CONQUEST_MOVE';
  }

  #endGame(status, winnerPlayerId) {
    this.#status = status;
    this.#winnerPlayerId = winnerPlayerId;
    this.#phase = 'GAME_OVER';
    this.#activeAttack = null;
    this.#emit(status === 'won' ? 'GAME_WON' : 'GAME_LOST', { winnerPlayerId });
  }

  #advanceTurn() {
    this.#activeAttack = null;
    this.#emit('TURN_END');

    // Next player who is still in the game. Going past the end of the order starts a new round
    let index = this.#currentTurnIndex;
    do {
      index++;
      if (index >= this.#turnOrder.length) {
        index = 0;
        this.#round++;
      }
    } while (this.#player(this.#turnOrder[index]).eliminated);

    this.#currentTurnIndex = index;
    this.#startTurn();
  }

  #startTurn() {
    const player = this.currentPlayer;
    this.#attackUsed = false;
    this.#emit('TURN_START');

    // From round 2: 2 new soldiers for every country the player controls
    if (this.#round >= 2) {
      this.#pendingReinforcements = reinforcementsFor(this.ownedCount(player.playerId));
      this.#phase = 'REINFORCE';
      this.#emit('REINFORCEMENTS_GRANTED', { count: this.#pendingReinforcements });
    } else {
      this.#pendingReinforcements = 0;
      this.#phase = 'PLANNING';
    }
  }

  #emit(type, payload = {}) {
    this.#eventSeq++;
    this.#newEvents.push({
      seq: this.#eventSeq,
      round: this.#round,
      playerId: this.#turnOrder[this.#currentTurnIndex],
      type,
      payload,
    });
  }

  #territory(iso2) {
    const territory = this.#territories.get(iso2);
    if (!territory) throw new GameRuleError('That country is not part of this game.');
    return territory;
  }

  #player(playerId) {
    return this.#players.get(playerId);
  }

  #assertTurn(playerId) {
    if (this.isOver) throw new GameRuleError('This game is over.');
    if (playerId !== this.currentPlayer.playerId) throw new GameRuleError("It's not your turn.");
  }

  #assertPhase(expected) {
    if (this.#phase !== expected) throw new GameRuleError(PHASE_HINTS[this.#phase]);
  }
}
