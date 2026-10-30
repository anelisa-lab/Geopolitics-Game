const STATUS_LABELS = { active: 'In progress', won: 'Victory', lost: 'Defeated' };

// Only what the page needs, never the owner's ID or anything private
export function buildGameView(game, viewerId) {
  const playersById = new Map(game.players.map((player) => [player.playerId, player]));
  const currentPlayerId = game.turnOrder[game.currentTurnIndex];

  const territories = game.territories.map((territory) => {
    const owner = playersById.get(territory.ownerPlayerId);
    return {
      iso2: territory.iso2,
      name: territory.name,
      soldiers: territory.soldiers,
      soldierValue: territory.soldierValue,
      ownerName: owner.name,
      ownerColor: owner.color,
      ownerIsHuman: owner.type === 'human',
    };
  });

  const players = game.turnOrder.map((playerId) => {
    const player = playersById.get(playerId);
    const owned = game.territories.filter((territory) => territory.ownerPlayerId === playerId);
    return {
      playerId,
      name: player.name,
      color: player.color,
      isHuman: player.type === 'human',
      eliminated: player.eliminated,
      isCurrent: playerId === currentPlayerId,
      territories: owned.length,
      soldiers: owned.reduce((sum, territory) => sum + territory.soldiers, 0),
    };
  });

  return {
    id: game._id.toString(),
    title: game.title,
    status: game.status,
    statusLabel: STATUS_LABELS[game.status],
    round: game.round,
    phase: game.phase,
    currentPlayer: players.find((player) => player.isCurrent),
    players,
    territories,
    isOwner: viewerId === game.ownerId.toString(),
  };
}