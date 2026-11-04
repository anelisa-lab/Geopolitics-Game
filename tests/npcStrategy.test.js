import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/domain/Game.js';
import { NpcStrategy } from '../src/ai/NpcStrategy.js';

// The human 'H' and NPCs 'N1'...'N9', each owning the country with the same ID
const IDS = ['H', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'];

function makeGame({ soldiers = {}, owners = {}, current = 'N1', ...rest } = {}) {
  return new Game({
    status: 'active',
    round: 2,
    phase: 'PLANNING',
    currentTurnIndex: IDS.indexOf(current),
    turnOrder: IDS,
    players: IDS.map((id, i) => ({ playerId: id, type: i === 0 ? 'human' : 'npc', name: i === 0 ? 'Home' : `NPC ${id}`, color: '#000000' })),
    territories: IDS.map((id) => ({
      iso2: id, name: `Land ${id}`, soldierValue: 4, ownerPlayerId: owners[id] ?? id, soldiers: soldiers[id] ?? 6,
    })),
    eventSeq: 1,
    ...rest,
  });
}

const strategy = new NpcStrategy();

test('attacks a weak country when the odds are good, and says why', () => {
  const game = makeGame({ soldiers: { N1: 10, N5: 1 } });
  const choice = strategy.chooseAttack(game, 'N1');

  assert.equal(choice.attack, true);
  assert.equal(choice.from, 'N1');
  assert.equal(choice.to, 'N5');
  assert.match(choice.justification, /Attacking Land N5 .*\d+% chance/);
});

test('skips its turn when every attack is a bad bet', () => {
  const game = makeGame({ soldiers: { N1: 3 } }); // everyone else has 6
  const choice = strategy.chooseAttack(game, 'N1');

  assert.equal(choice.attack, false);
  assert.match(choice.justification, /^Skipping/);
});

test('prefers a target that knocks a player out of the game', () => {
  // N4, N5 and N6 all have 2 soldiers. N4 also owns N6, but N5's owner has nothing else left.
  // Everyone else is too strong to attack, so only that difference matters
  const strong = Object.fromEntries(IDS.map((id) => [id, 12]));
  const game = makeGame({ soldiers: { ...strong, N1: 12, N4: 2, N5: 2, N6: 2 }, owners: { N6: 'N4' } });
  const choice = strategy.chooseAttack(game, 'N1');

  assert.equal(choice.to, 'N5');
  assert.match(choice.justification, /out of the game/);
});

test('calls off an attack once the odds turn bad', () => {
  const game = makeGame({ soldiers: { N1: 3, N5: 6 } });
  const decision = strategy.shouldContinue(game, 'N1', 'N5', 10);

  assert.equal(decision.continue, false);
  assert.match(decision.justification, /^Stopping/);
});

test('keeps attacking while it is winning', () => {
  const game = makeGame({ soldiers: { N1: 9, N5: 2 } });
  assert.equal(strategy.shouldContinue(game, 'N1', 'N5', 10).continue, true);
});

test('places all its reinforcements on its own countries', () => {
  const game = makeGame({ phase: 'REINFORCE', pendingReinforcements: 4, owners: { N2: 'N1' } });
  const plan = strategy.planReinforcements(game, 'N1');

  const placed = plan.allocations.reduce((sum, a) => sum + a.count, 0);
  assert.equal(placed, 4);
  for (const { iso2 } of plan.allocations) assert.ok(['N1', 'N2'].includes(iso2));
  assert.ok(plan.justification.length > 10);
});

test('reinforcements back an attack that becomes a good bet', () => {
  // 4 vs 3 is risky, but with 6 more soldiers it's a strong attack
  const game = makeGame({ phase: 'REINFORCE', pendingReinforcements: 6, soldiers: { N1: 4, N5: 3 } });
  const plan = strategy.planReinforcements(game, 'N1');

  assert.deepEqual(plan.allocations, [{ iso2: 'N1', count: 6 }]);
  assert.match(plan.justification, /prepare a strike/);
});
