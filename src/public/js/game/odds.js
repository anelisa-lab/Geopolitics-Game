// Estimates the chance that an attack conquers its target by playing it out
// thousands of times with the game's real rules (no 3-dice limit, dice not sorted)
const cache = new Map();

export function winChance(attackers, defenders, runs = 2000) {
  const key = `${attackers}:${defenders}`;
  if (cache.has(key)) return cache.get(key);

  let wins = 0;
  for (let run = 0; run < runs; run++) {
    let a = attackers;
    let d = defenders;
    while (a > 1 && d > 0) {
      const dice = Math.min(a - 1, d);
      for (let i = 0; i < dice; i++) {
        const attack = 1 + Math.floor(Math.random() * 6);
        const defend = 1 + Math.floor(Math.random() * 6);
        if (attack > defend) d--;
        else if (defend > attack) a--;
      }
    }
    if (d === 0) wins++;
  }

  const chance = wins / runs;
  cache.set(key, chance);
  return chance;
}
