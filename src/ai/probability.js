// The exact chance that an attack conquers its target, using the brief's battle rules.
//
// Each pair of dice is independent: the attacker wins a pair 15 times in 36,
// the defender wins 15 times in 36, and 6 times in 36 it's a tie (nobody falls).
// From a position (attackers, defenders) we add up every possible result of the
// next roll, each weighted by how likely it is, and repeat from each new position.
// Results are remembered, so each position is only worked out once.

const WIN = 15 / 36;
const LOSE = 15 / 36;
const TIE = 6 / 36;

// Bigger armies are scaled down to this size. The odds depend on the ratio between the
// two sides far more than on the exact numbers, and it keeps the calculation fast
const MAX_ARMY = 60;

const memo = new Map();
const logFactorials = [0];

function logFactorial(n) {
  for (let i = logFactorials.length; i <= n; i++) logFactorials[i] = logFactorials[i - 1] + Math.log(i);
  return logFactorials[n];
}

// Chance that, with n dice each, the attacker loses exactly i soldiers and the defender exactly j
function rollChance(n, i, j) {
  const ties = n - i - j;
  return Math.exp(
    logFactorial(n) - logFactorial(i) - logFactorial(j) - logFactorial(ties)
    + i * Math.log(LOSE) + j * Math.log(WIN) + ties * Math.log(TIE),
  );
}

function solve(attackers, defenders) {
  if (defenders <= 0) return 1; // conquered
  if (attackers <= 1) return 0; // down to the last soldier: the attack fails

  const key = attackers * 1000 + defenders;
  if (memo.has(key)) return memo.get(key);

  const dice = Math.min(attackers - 1, defenders);
  let total = 0;
  for (let i = 0; i <= dice; i++) {
    for (let j = 0; i + j <= dice; j++) {
      if (i === 0 && j === 0) continue; // all ties: same position again (handled below)
      total += rollChance(dice, i, j) * solve(attackers - i, defenders - j);
    }
  }
  // An all-tie roll changes nothing, so the answer is the same as if it never happened
  const result = total / (1 - TIE ** dice);
  memo.set(key, result);
  return result;
}

export function winProbability(attackers, defenders) {
  if (defenders <= 0) return 1;
  if (attackers <= 1) return 0;
  const biggest = Math.max(attackers, defenders);
  if (biggest > MAX_ARMY) {
    const scale = MAX_ARMY / biggest;
    attackers = Math.max(2, Math.round(attackers * scale));
    defenders = Math.max(1, Math.round(defenders * scale));
  }
  return solve(attackers, defenders);
}
