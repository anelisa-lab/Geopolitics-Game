import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BattleEngine } from '../src/domain/BattleEngine.js';
import { Dice } from '../src/domain/Dice.js';
import { GameRuleError } from '../src/domain/errors.js';

// Dice that roll these exact values, in order: attacker's dice first, then the defender's
const fixedDice = (...values) => {
  let i = 0;
  return new Dice(() => values[i++]);
};

test("the brief's example: 1v2 and 4v3 means both sides lose 1", () => {
  const engine = new BattleEngine(fixedDice(1, 4, 2, 3));
  const result = engine.roll(10, 2);

  assert.deepEqual(result.pairs, [
    { attack: 1, defend: 2, winner: 'defender' },
    { attack: 4, defend: 3, winner: 'attacker' },
  ]);
  assert.equal(result.attackerLosses, 1);
  assert.equal(result.defenderLosses, 1);
});

test("dice count follows the brief's examples", () => {
  assert.equal(BattleEngine.diceCount(10, 2), 2);
  assert.equal(BattleEngine.diceCount(3, 5), 2);
  assert.equal(BattleEngine.diceCount(2, 5), 1);
});

test('there is no limit of 3 dice', () => {
  assert.equal(BattleEngine.diceCount(10, 10), 9);
});

test('a tie kills nobody', () => {
  const result = new BattleEngine(fixedDice(3, 3)).roll(2, 5);
  assert.equal(result.pairs[0].winner, 'tie');
  assert.equal(result.attackerLosses, 0);
  assert.equal(result.defenderLosses, 0);
});

test('dice are paired in the order rolled, not sorted', () => {
  // In order: 6v1 attacker wins, 2v5 defender wins. Sorted (6v5, 2v1) the attacker would win both
  const result = new BattleEngine(fixedDice(6, 2, 1, 5)).roll(3, 2);
  assert.equal(result.attackerLosses, 1);
  assert.equal(result.defenderLosses, 1);
});

test('you need at least 2 soldiers to attack', () => {
  assert.throws(() => new BattleEngine().roll(1, 3), GameRuleError);
});

test('real dice only roll 1 to 6', () => {
  const values = new Dice().rollMany(1000);
  assert.ok(values.every((value) => value >= 1 && value <= 6));
  assert.equal(new Set(values).size, 6); // every face shows up
});
