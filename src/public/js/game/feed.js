import { el, plural } from './dom.js';

const MAX_ITEMS = 150;

// Turns one game event into a sentence for the live feed. Returns null for events not worth showing
export function describe(event, names) {
  const p = event.payload ?? {};
  const isYou = (id) => id === names.humanId;
  const who = (id) => (isYou(id) ? 'You' : names.player.get(id) ?? 'Someone');
  const country = (iso2) => names.country.get(iso2) ?? iso2;
  // "You place" / "NPC Brazil places"
  const act = (id, youVerb, theyVerb) => `${who(id)} ${isYou(id) ? youVerb : theyVerb}`;
  const actor = event.playerId;

  switch (event.type) {
    case 'GAME_CREATED':
      return { kind: 'info', text: 'The game begins. The turn order was drawn at random.' };
    case 'TURN_START':
      return { kind: 'turn', text: isYou(actor) ? 'Your turn.' : `${who(actor)}'s turn.` };
    case 'REINFORCEMENTS_GRANTED':
      return { kind: 'info', text: `${act(actor, 'receive', 'receives')} ${plural(p.count, 'new soldier')}.` };
    case 'REINFORCE':
      return {
        kind: 'info',
        text: `${act(actor, 'place', 'places')} reinforcements: ${p.allocations.map((a) => `${country(a.iso2)} +${a.count}`).join(', ')}.`,
      };
    case 'TRANSFER':
      return { kind: 'info', text: `${act(actor, 'move', 'moves')} ${plural(p.count, 'soldier')} from ${country(p.from)} to ${country(p.to)}.` };
    case 'NPC_DECISION':
      return { kind: 'npc', text: `🤖 ${who(actor)}: ${event.justification ?? p.summary ?? 'makes a move.'}` };
    case 'ATTACK_START':
      return { kind: 'attack', text: `⚔️ ${country(p.from)} (${p.attackerSoldiers}) attacks ${country(p.to)} (${p.defenderSoldiers})!` };
    case 'DICE_ROLL':
      return {
        kind: 'roll',
        text: `🎲 ${p.pairs.map((d) => `${d.attack}–${d.defend}`).join(', ')} · ${country(p.from)} −${p.attackerLosses}, ${country(p.to)} −${p.defenderLosses}. Now ${p.attackerSoldiers} vs ${p.defenderSoldiers}.`,
        commentary: event.commentary,
      };
    case 'ATTACK_STOPPED':
      return { kind: 'info', text: `${act(actor, 'call', 'calls')} off the attack on ${country(p.to)}.` };
    case 'ATTACK_FAILED':
      return { kind: 'info', text: `${country(p.from)} is down to its last soldier. The attack on ${country(p.to)} fails.` };
    case 'CONQUEST':
      return { kind: 'conquest', text: `🏳️ ${country(p.to)} falls to ${isYou(actor) ? 'you' : who(actor)}! +${plural(p.bonus, 'soldier')}.` };
    case 'CONQUEST_MOVE':
      return p.count ? { kind: 'info', text: `${act(actor, 'move', 'moves')} ${plural(p.count, 'more soldier')} into ${country(p.to)}.` } : null;
    case 'ELIMINATION':
      return { kind: 'elimination', text: `☠️ ${who(p.playerId)} ${isYou(p.playerId) ? 'have' : 'has'} been eliminated.` };
    case 'GAME_WON':
      return { kind: 'conquest', text: '🏆 You conquered the world!' };
    case 'GAME_LOST':
      return { kind: 'elimination', text: 'Game over. Your last country has fallen.' };
    default:
      return null; // e.g. TURN_END: the next TURN_START says it all
  }
}

export function namesFrom(state) {
  return {
    humanId: state.isOwner ? state.humanPlayerId : null, // only the player themselves is "You"
    player: new Map(state.players.map((player) => [player.playerId, player.name])),
    country: new Map(state.territories.map((territory) => [territory.iso2, territory.name])),
  };
}

export class Feed {
  #list;
  #seen = new Set();

  constructor(list) {
    this.#list = list;
  }

  // Newest first. Events already shown are skipped, so overlapping updates never double up
  add(events, state) {
    const names = namesFrom(state);
    for (const event of events) {
      if (this.#seen.has(event.seq)) continue;
      this.#seen.add(event.seq);

      const line = describe(event, names);
      if (!line) continue;
      this.#list.prepend(
        el('li', { class: `feed-item feed-${line.kind}` },
          el('span', { class: 'feed-round' }, `R${event.round}`),
          el('span', { class: 'feed-text' }, line.text,
            line.commentary ? el('span', { class: 'feed-commentary' }, `🎙️ ${line.commentary}`) : null)),
      );
    }
    while (this.#list.children.length > MAX_ITEMS) this.#list.lastElementChild.remove();
  }
}
