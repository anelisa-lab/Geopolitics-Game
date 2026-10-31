const STATUS_LABELS = { active: 'In progress', won: 'Victory', lost: 'Defeated' };

// Everything a game page needs, and nothing private (like the owner's ID)
export function buildGameView(game, viewerId) {
  const playersById = new Map(game.players.map((player) => [player.playerId, player]));
  const currentPlayerId = game.turnOrder[game.currentTurnIndex];
  const human = game.players.find((player) => player.type === 'human');

  const territories = game.territories.map((territory) => {
    const owner = playersById.get(territory.ownerPlayerId);
    return {
      iso2: territory.iso2,
      name: territory.name,
      soldiers: territory.soldiers,
      soldierValue: territory.soldierValue,
      ownerPlayerId: territory.ownerPlayerId,
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
    humanPlayerId: human.playerId,
    isHumanTurn: game.status === 'active' && currentPlayerId === human.playerId,
    pendingReinforcements: game.pendingReinforcements,
    attackUsed: game.attackUsed,
    activeAttack: game.activeAttack
      ? { from: game.activeAttack.fromIso2, to: game.activeAttack.toIso2, rolls: game.activeAttack.rolls }
      : null,
    winnerPlayerId: game.winnerPlayerId,
    eventSeq: game.eventSeq,
    players,
    territories,
    isOwner: viewerId === game.ownerId.toString(),
  };
}

// One row in a games list
export function buildGameSummary(game, viewerId, ownerName = null) {
  const human = game.players.find((player) => player.type === 'human');
  const currentPlayer = game.players.find((player) => player.playerId === game.turnOrder[game.currentTurnIndex]);

  return {
    id: game._id.toString(),
    title: game.title,
    humanCountry: human.name,
    humanIso2: human.playerId,
    ownerName,
    status: game.status,
    statusLabel: STATUS_LABELS[game.status],
    round: game.round,
    territoriesOwned: game.territories.filter((t) => t.ownerPlayerId === human.playerId).length,
    currentPlayerName: currentPlayer.name,
    updatedAt: game.updatedAt,
    isOwner: viewerId === game.ownerId.toString(),
  };
}
