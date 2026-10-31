import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Territory } from '../src/domain/Territory.js';
import { playerFromDocument, HumanPlayer, NpcPlayer } from '../src/domain/Player.js';
import { GameRuleError } from '../src/domain/errors.js';

const makeTerritory = (soldiers = 5) =>
  new Territory({ iso2: 'ZA', name: 'South Africa', soldierValue: 5, ownerPlayerId: 'ZA', soldiers });

test('a country always keeps 1 soldier when moving or attacking', () => {
  assert.equal(makeTerritory(5).movableSoldiers(), 4);
  assert.equal(makeTerritory(1).movableSoldiers(), 0);
});

test('a country needs 2 soldiers to attack', () => {
  assert.equal(makeTerritory(1).canAttack(), false);
  assert.equal(makeTerritory(2).canAttack(), true);
});

test("you can't remove more soldiers than a country has, or a negative number", () => {
  assert.throws(() => makeTerritory(3).removeSoldiers(4), GameRuleError);
  assert.throws(() => makeTerritory(3).addSoldiers(-1), GameRuleError);
  assert.throws(() => makeTerritory(3).addSoldiers(1.5), GameRuleError);
});

test('soldiers can only change through methods', () => {
  const territory = makeTerritory(3);
  assert.throws(() => { territory.soldiers = 99; }, TypeError); // there's no setter
  assert.equal(territory.soldiers, 3);
});

test('conquering changes the owner and the soldiers', () => {
  const territory = makeTerritory(3);
  territory.conquer('BR', 2);
  assert.equal(territory.isOwnedBy('BR'), true);
  assert.equal(territory.soldiers, 2);
});

test('saved players come back as the right kind', () => {
  const human = playerFromDocument({ playerId: 'ZA', type: 'human', name: 'South Africa', color: '#000' });
  const npc = playerFromDocument({ playerId: 'BR', type: 'npc', name: 'NPC Brazil', color: '#111' });

  assert.ok(human instanceof HumanPlayer);
  assert.ok(npc instanceof NpcPlayer);
  assert.equal(human.displayName, 'South Africa (you)');
  assert.equal(npc.isNpc, true);
});
