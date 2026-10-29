const BANDS = [[5e6, 1], [10e6, 2], [25e6, 3], [50e6, 4], [75e6, 5], [100e6, 6], [125e6, 7], [150e6, 8]];

// "Up to 5 million" = 1 soldier, ... "Anything more" = 9
export const soldierValueFor = (population) => (BANDS.find(([max]) => population <= max) ?? [0, 9])[1];

// Conquering a country gives Max(2, soldier value / 2), rounded down
export const conquestBonus = (soldierValue) => Math.max(2, Math.floor(soldierValue / 2));

// From round 2: 2 new soldiers per country you control
export const reinforcementsFor = (territoryCount) => 2 * territoryCount;