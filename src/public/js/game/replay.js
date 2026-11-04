// Rebuilds the board one event at a time, so the page can show each NPC move as it happens
// (instead of jumping straight to the end). The server's state stays the source of truth:
// when a batch of events has been shown, the page switches to the state the server sent.

const STATUS_LABELS = { active: 'In progress', won: 'Victory', lost: 'Defeated' };

export function applyEvent(view, event) {
  const p = event.payload ?? {};
  const territory = (iso2) => view.territories.find((t) => t.iso2 === iso2);
  const player = (id) => view.players.find((pl) => pl.playerId === id);

  view.round = event.round;
  view.eventSeq = Math.max(view.eventSeq ?? 0, event.seq);

  switch (event.type) {
    case 'TURN_START':
      setCurrentPlayer(view, event.playerId);
      view.phase = 'PLANNING';
      view.attackUsed = false;
      view.pendingReinforcements = 0;
      break;
    case 'REINFORCEMENTS_GRANTED':
      view.phase = 'REINFORCE';
      view.pendingReinforcements = p.count;
      break;
    case 'REINFORCE':
      for (const { iso2, count } of p.allocations) territory(iso2).soldiers += count;
      view.pendingReinforcements = 0;
      view.phase = 'PLANNING';
      break;
    case 'TRANSFER':
    case 'CONQUEST_MOVE':
      territory(p.from).soldiers -= p.count;
      territory(p.to).soldiers += p.count;
      if (event.type === 'CONQUEST_MOVE') view.activeAttack = null;
      break;
    case 'ATTACK_START':
      view.phase = 'ATTACKING';
      view.attackUsed = true;
      view.activeAttack = { from: p.from, to: p.to, rolls: 0 };
      break;
    case 'DICE_ROLL':
      territory(p.from).soldiers = p.attackerSoldiers;
      territory(p.to).soldiers = p.defenderSoldiers;
      if (view.activeAttack) view.activeAttack.rolls = p.roll;
      break;
    case 'CONQUEST': {
      const conqueror = player(event.playerId);
      Object.assign(territory(p.to), {
        ownerPlayerId: conqueror.playerId,
        ownerName: conqueror.name,
        ownerColor: conqueror.color,
        ownerIsHuman: conqueror.isHuman,
        soldiers: p.bonus,
      });
      view.phase = 'CONQUEST_MOVE';
      break;
    }
    case 'ATTACK_STOPPED':
    case 'ATTACK_FAILED':
    case 'TURN_END':
      view.activeAttack = null;
      break;
    case 'ELIMINATION':
      player(p.playerId).eliminated = true;
      break;
    case 'GAME_WON':
    case 'GAME_LOST':
      view.status = event.type === 'GAME_WON' ? 'won' : 'lost';
      view.statusLabel = STATUS_LABELS[view.status];
      view.phase = 'GAME_OVER';
      view.activeAttack = null;
      view.winnerPlayerId = p.winnerPlayerId ?? null;
      view.isHumanTurn = false;
      break;
    default:
      break; // NPC_DECISION and GAME_CREATED don't change the board
  }

  recount(view);
  return view;
}

function setCurrentPlayer(view, playerId) {
  for (const player of view.players) player.isCurrent = player.playerId === playerId;
  view.currentPlayer = view.players.find((player) => player.isCurrent);
  view.isHumanTurn = view.status === 'active' && playerId === view.humanPlayerId;
}

// Each player's number of countries and soldiers, for the players panel
function recount(view) {
  for (const player of view.players) {
    const owned = view.territories.filter((t) => t.ownerPlayerId === player.playerId);
    player.territories = owned.length;
    player.soldiers = owned.reduce((sum, t) => sum + t.soldiers, 0);
  }
}
