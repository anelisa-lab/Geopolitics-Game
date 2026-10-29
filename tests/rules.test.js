import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soldierValueFor, conquestBonus, reinforcementsFor } from '../src/domain/rules.js';

test('soldier value follows the population bands', () => {
  assert.equal(soldierValueFor(1_000), 1);
  assert.equal(soldierValueFor(5_000_000), 1);      // "up to 5 million" includes exactly 5 million
  assert.equal(soldierValueFor(5_000_001), 2);
  assert.equal(soldierValueFor(25_000_000), 3);
  assert.equal(soldierValueFor(64_000_000), 5);     // about South Africa's population
  assert.equal(soldierValueFor(150_000_000), 8);
  assert.equal(soldierValueFor(150_000_001), 9);
  assert.equal(soldierValueFor(1_400_000_000), 9);
});

test('conquest bonus is max(2, soldier value / 2) rounded down', () => {
  assert.equal(conquestBonus(9), 4);   // India example from the brief
  assert.equal(conquestBonus(1), 2);   // Vatican City example from the brief
  assert.equal(conquestBonus(5), 2);
  assert.equal(conquestBonus(8), 4);
});

test('reinforcements are 2 per country controlled', () => {
  assert.equal(reinforcementsFor(1), 2);
  assert.equal(reinforcementsFor(3), 6);
  assert.equal(reinforcementsFor(5), 10);
});