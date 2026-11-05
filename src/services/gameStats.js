// The player's battle record for one game, worked out from its saved events
export function summarizeBattles(events) {
  const stats = { attacks: 0, conquests: 0, rolls: 0, enemiesDefeated: 0, soldiersLost: 0 };
  for (const event of events) {
    if (event.type === 'ATTACK_START') stats.attacks++;
    else if (event.type === 'CONQUEST') stats.conquests++;
    else if (event.type === 'DICE_ROLL') {
      stats.rolls++;
      stats.enemiesDefeated += event.payload.defenderLosses;
      stats.soldiersLost += event.payload.attackerLosses;
    }
  }
  return stats;
}