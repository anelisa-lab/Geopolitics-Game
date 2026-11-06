import { winProbability } from './probability.js';
import { conquestBonus } from '../domain/rules.js';

// How bold the NPC is. Change these to make NPCs more aggressive or more careful
const DEFAULT_SETTINGS = {
  attackThreshold: 0.55, // only attack with at least this chance of conquering
  stopThreshold: 0.35,   // call off an attack once the chance drops below this
  threatThreshold: 0.6,  // a country is "in danger" if an enemy could take it with this chance
  leaderBonus: 2,        // how much more it wants to attack the strongest rival
};

// The three difficulty levels a player can choose when starting a game
export const DIFFICULTIES = {
  // Cautious: only near-certain attacks, retreats early, doesn't single out the leader
  easy: { attackThreshold: 0.75, stopThreshold: 0.5, threatThreshold: 0.7, leaderBonus: 0 },
  normal: DEFAULT_SETTINGS,
  // Bold: takes even chances, fights on longer, and gangs up on whoever is winning
  hard: { attackThreshold: 0.45, stopThreshold: 0.25, threatThreshold: 0.5, leaderBonus: 5 },
};

// "over 99%" rather than "100%" unless it really is certain
const percent = (chance) => (chance > 0.99 && chance < 1 ? 'over 99%' : `${Math.round(chance * 100)}%`);

// Decides what an NPC does on its turn. It looks at the whole board, works out the
// odds of every possible attack, and plays to win. Every decision comes with a short
// explanation that is shown to the player.
export class NpcStrategy {
  #settings;

  constructor(settings = {}) {
    this.#settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  // ---------- Reinforcements ----------

  planReinforcements(game, npcId) {
    const count = game.pendingReinforcements;
    const mine = game.territoriesOf(npcId);

    // 1. Back the best attack available once the new soldiers are in place
    const attack = this.#bestAttack(game, npcId, count);
    if (attack && attack.chance >= this.#settings.attackThreshold) {
      return {
        allocations: [{ iso2: attack.from.iso2, count }],
        justification: `Placing ${count} on ${attack.from.name} to prepare a strike on ${attack.to.name} (${percent(attack.chance)} chance to take it).`,
      };
    }

    // 2. Otherwise protect the country most at risk
    const danger = mine
      .map((territory) => ({ territory, ...this.#threatTo(game, npcId, territory) }))
      .sort((a, b) => b.chance - a.chance)[0];
    if (danger.chance >= this.#settings.threatThreshold) {
      return {
        allocations: [{ iso2: danger.territory.iso2, count }],
        justification: `Placing ${count} on ${danger.territory.name} to defend it against ${danger.attacker.name}'s ${danger.attacker.soldiers} soldiers.`,
      };
    }

    // 3. Nothing urgent: build one strong army for later
    const strongest = [...mine].sort((a, b) => b.soldiers - a.soldiers)[0];
    return {
      allocations: [{ iso2: strongest.iso2, count }],
      justification: `Placing ${count} on ${strongest.name} to build up a strike force.`,
    };
  }

  // ---------- Moving soldiers before attacking ----------

  // Moves spare soldiers from another country into the planned attack, if it helps
  planTransfer(game, npcId) {
    const attack = this.#bestAttack(game, npcId);
    if (!attack) return null;

    const strongestEnemy = Math.max(...this.#enemies(game, npcId).map((t) => t.soldiers));
    const keep = Math.max(1, Math.ceil(strongestEnemy / 2)); // leave enough behind to make attacking it costly

    const donor = game.territoriesOf(npcId)
      .filter((t) => t.iso2 !== attack.from.iso2 && t.soldiers - keep >= 2)
      .sort((a, b) => b.soldiers - a.soldiers)[0];
    if (!donor) return null;

    const count = donor.soldiers - keep;
    const boosted = winProbability(attack.from.soldiers + count, attack.to.soldiers);
    // Only worth weakening the other country if it turns the attack into a good one
    if (boosted < this.#settings.attackThreshold || boosted - attack.chance < 0.05) return null;

    return {
      from: donor.iso2,
      to: attack.from.iso2,
      count,
      justification: `Moving ${count} soldiers from ${donor.name} to ${attack.from.name} to strengthen the attack on ${attack.to.name} (${percent(attack.chance)} → ${percent(boosted)}), keeping ${keep} behind.`,
    };
  }

  // ---------- Attacking ----------

  chooseAttack(game, npcId) {
    const attack = this.#bestAttack(game, npcId);

    if (!attack) {
      return { attack: false, justification: 'Skipping: none of my countries has the 2 soldiers needed to attack.' };
    }

    const odds = `${attack.from.soldiers} vs ${attack.to.soldiers}`;
    if (attack.chance < this.#settings.attackThreshold) {
      return {
        attack: false,
        justification: `Skipping: my best option is ${odds} against ${attack.to.name} (${percent(attack.chance)} chance). Saving my strength.`,
      };
    }

    let reason = `Attacking ${attack.to.name} from ${attack.from.name}: ${odds}, ${percent(attack.chance)} chance to win.`;
    if (attack.eliminates) reason += ` Taking it knocks ${attack.ownerName} out of the game.`;
    else if (attack.ownerIsLeader) reason += ` ${attack.ownerName} is the strongest rival.`;

    return { attack: true, from: attack.from.iso2, to: attack.to.iso2, justification: reason };
  }

  // After each roll: keep going or call it off?
  shouldContinue(game, fromIso2, toIso2, startingSoldiers) {
    const from = game.territories.find((t) => t.iso2 === fromIso2);
    const to = game.territories.find((t) => t.iso2 === toIso2);
    const chance = winProbability(from.soldiers, to.soldiers);
    const reserve = Math.max(2, Math.ceil(startingSoldiers / 3));

    if (from.soldiers < reserve) {
      return { continue: false, justification: `Stopping: down to ${from.soldiers} in ${from.name}. Keeping them to defend it.` };
    }
    if (chance < this.#settings.stopThreshold) {
      return {
        continue: false,
        justification: `Stopping: now ${from.soldiers} vs ${to.soldiers} (${percent(chance)} chance). Retreating to protect ${from.name}.`,
      };
    }
    return { continue: true };
  }

  // After a conquest: how many soldiers follow into the new country?
  planConquestMove(game, npcId, fromIso2, toIso2) {
    const from = game.territories.find((t) => t.iso2 === fromIso2);
    const to = game.territories.find((t) => t.iso2 === toIso2);
    const movable = from.soldiers - 1;

    if (movable === 0) return { count: 0, justification: `No soldiers to spare from ${from.name}.` };

    const danger = this.#threatTo(game, npcId, to);
    if (danger.chance >= 0.5) {
      const count = Math.ceil(movable / 2);
      return {
        count,
        justification: `Moving ${count} into ${to.name}, which ${danger.attacker.name} could easily retake. ${from.name} keeps ${from.soldiers - count}.`,
      };
    }
    return { count: 0, justification: `Keeping the army together in ${from.name} for the next strike.` };
  }

  // ---------- Board reading ----------

  #enemies(game, npcId) {
    return game.territories.filter((t) => t.ownerPlayerId !== npcId);
  }

  // The enemy country most likely to conquer this one
  #threatTo(game, npcId, territory) {
    let worst = { chance: 0, attacker: null };
    for (const enemy of this.#enemies(game, npcId)) {
      const chance = winProbability(enemy.soldiers, territory.soldiers);
      if (chance > worst.chance) worst = { chance, attacker: enemy };
    }
    return worst;
  }

  // Scores every possible attack and returns the best one.
  // `extraSoldiers` lets reinforcement planning ask "what if I added these?"
  #bestAttack(game, npcId, extraSoldiers = 0) {
    const players = new Map(game.players.map((player) => [player.playerId, player]));
    const strength = new Map();
    for (const t of game.territories) strength.set(t.ownerPlayerId, (strength.get(t.ownerPlayerId) ?? 0) + t.soldiers);
    const leaderId = [...strength].filter(([id]) => id !== npcId).sort((a, b) => b[1] - a[1])[0]?.[0];

    let best = null;
    for (const from of game.territoriesOf(npcId)) {
      const attackers = from.soldiers + extraSoldiers;
      if (attackers < 2) continue;

      for (const to of this.#enemies(game, npcId)) {
        const chance = winProbability(attackers, to.soldiers);
        const eliminates = game.ownedCount(to.ownerPlayerId) === 1;
        const ownerIsLeader = to.ownerPlayerId === leaderId;

        // What we gain if it works, minus what we risk losing if it doesn't
        const gain = conquestBonus(to.soldierValue) + to.soldierValue + (eliminates ? 5 : 0) + (ownerIsLeader ? this.#settings.leaderBonus : 0);
        const risk = (1 - chance) * 0.3 * (attackers - 1);
        const score = chance * gain - risk;

        if (!best || score > best.score) {
          best = {
            from: { ...from, soldiers: attackers },
            to,
            chance,
            score,
            eliminates,
            ownerIsLeader,
            ownerName: players.get(to.ownerPlayerId).name,
          };
        }
      }
    }
    return best;
  }
}
