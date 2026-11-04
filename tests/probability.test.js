import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winProbability } from '../src/ai/probability.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('2 vs 1 is a coin toss', () => {
  // One die each: win or lose 15/36 each, ties are re-rolled. So exactly 50%
  close(winProbability(2, 1), 0.5);
});

test('3 vs 1 is 75%', () => {
  // Win now (15/36), or lose one soldier and play 2 vs 1 (15/36 × 50%), ties re-rolled
  close(winProbability(3, 1), 0.75);
});

test('impossible and certain attacks', () => {
  assert.equal(winProbability(1, 5), 0); // can't attack with 1 soldier
  assert.equal(winProbability(5, 0), 1); // nobody left to defend
});

test('more attackers always means better odds', () => {
  for (let attackers = 2; attackers < 20; attackers++) {
    assert.ok(winProbability(attackers + 1, 5) > winProbability(attackers, 5));
  }
});

test('big armies are handled quickly and sensibly', () => {
  const started = Date.now();
  const chance = winProbability(300, 100);
  assert.ok(chance > 0.95 && chance <= 1);
  assert.ok(Date.now() - started < 2000);
});
