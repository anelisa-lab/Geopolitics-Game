import { Dice } from './Dice.js';
import { GameRuleError } from './errors.js';

export class BattleEngine {
  #dice;

  constructor(dice = new Dice()) {
    this.#dice = dice;
  }

  // The attacker must leave 1 soldier at home. The smaller side sets the number of dice
  static diceCount(attackerSoldiers, defenderSoldiers) {
    return Math.min(attackerSoldiers - 1, defenderSoldiers);
  }

  roll(attackerSoldiers, defenderSoldiers) {
    if (attackerSoldiers < 2) throw new GameRuleError('You need at least 2 soldiers to attack.');
    if (defenderSoldiers < 1) throw new GameRuleError('That country has no soldiers left to defend it.');

    const count = BattleEngine.diceCount(attackerSoldiers, defenderSoldiers);
    const attackerDice = this.#dice.rollMany(count);
    const defenderDice = this.#dice.rollMany(count);

    let attackerLosses = 0;
    let defenderLosses = 0;

    // Die 1 vs die 1, die 2 vs die 2... in the order rolled (not sorted)
    const pairs = attackerDice.map((attack, i) => {
      const defend = defenderDice[i];
      let winner = 'tie'; // a tie: nobody loses a soldier
      if (attack > defend) {
        defenderLosses++;
        winner = 'attacker';
      } else if (defend > attack) {
        attackerLosses++;
        winner = 'defender';
      }
      return { attack, defend, winner };
    });

    return { pairs, attackerLosses, defenderLosses };
  }
}
