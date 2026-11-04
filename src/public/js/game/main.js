import { createApi } from './api.js';
import { el, flagUrl, plural } from './dom.js';
import { Feed } from './feed.js';
import { versus, animateRoll, rollSummary } from './battle.js';
import { applyEvent } from './replay.js';
import { winChance } from './odds.js';
import { toast } from './toast.js';

const POLL_MS = 4000; // how often watchers check for new moves (Day 6 makes this instant)

const PHASE_LABELS = {
  REINFORCE: 'Placing reinforcements',
  PLANNING: 'Planning',
  ATTACKING: 'Attack in progress',
  CONQUEST_MOVE: 'Moving into a conquered country',
  GAME_OVER: 'Game over',
};

// How long each kind of move stays on screen (milliseconds) at normal speed
const DELAYS = {
  TURN_START: 400,
  NPC_DECISION: 1100,
  REINFORCE: 450,
  TRANSFER: 450,
  ATTACK_START: 650,
  DICE_ROLL: 750,
  CONQUEST: 900,
  CONQUEST_MOVE: 450,
  ATTACK_FAILED: 650,
  ATTACK_STOPPED: 550,
  ELIMINATION: 1200,
};
const FAST_FACTOR = 0.12; // fast-forward plays moves about 8 times faster, but still shows every one
const FAST_FORWARD_KEY = 'geopolitics-fast-forward';

// Runs the game page: draws the board, turns clicks into moves, and plays back
// everyone else's moves one at a time so the player can follow them
class GameScreen {
  #api;
  #state;                    // the latest board from the server
  #view;                     // the board on screen (catches up with #state during playback)
  #feed;
  #dialog;
  #els;
  #lastSeq = 0;
  #busy = false;             // a move is on its way to the server
  #playing = false;          // other players' moves are being shown
  #queue = [];
  #fast = false;
  #wake = null;              // ends the current pause early when fast-forward is switched on
  #selected = null;          // the player's country chosen to attack or move from
  #allocations = new Map();  // reinforcements placed but not yet confirmed

  constructor(root, initialState) {
    this.#api = createApi(root.dataset.gameId);
    this.#state = initialState;
    this.#view = structuredClone(initialState);
    this.#feed = new Feed(document.getElementById('feed'));
    this.#dialog = document.getElementById('dialog');
    this.#els = {
      meta: document.getElementById('game-meta'),
      banner: document.getElementById('banner'),
      players: document.getElementById('players'),
      actions: document.getElementById('actions'),
      board: document.getElementById('board'),
      fastForward: document.getElementById('ff-btn'),
      arena: document.getElementById('arena'),
      arenaTurn: document.getElementById('arena-turn'),
      arenaThought: document.getElementById('arena-thought'),
      arenaFight: document.getElementById('arena-fight'),
    };

    try {
      this.#fast = localStorage.getItem(FAST_FORWARD_KEY) === 'on';
    } catch {
      // storage blocked: start at normal speed
    }

    document.getElementById('share-btn').addEventListener('click', () => this.#share());
    this.#els.fastForward.addEventListener('click', () => this.#toggleFastForward());

    // Escape mustn't close the window in the middle of a battle or conquest
    this.#dialog.addEventListener('cancel', (event) => {
      if (['ATTACKING', 'CONQUEST_MOVE'].includes(this.#state.phase)) event.preventDefault();
    });
  }

  async start() {
    this.#render();
    try {
      // The history so far goes straight into the feed (no need to replay it)
      const { events } = await this.#api.events(0);
      this.#feed.add(events, this.#view);
      if (events.length) this.#lastSeq = Math.max(...events.map((event) => event.seq));
    } catch {
      toast('The game history could not be loaded. Refresh to try again.', 'error');
    }
    this.#resume();
    setInterval(() => this.#poll(), POLL_MS);
  }

  // ---------- Helpers ----------

  get #canAct() {
    return this.#state.isOwner && this.#state.isHumanTurn && !this.#busy && !this.#playing;
  }

  #territory(iso2) {
    return this.#state.territories.find((territory) => territory.iso2 === iso2);
  }

  #isMine(territory) {
    return territory.ownerPlayerId === this.#state.humanPlayerId;
  }

  #placed() {
    return [...this.#allocations.values()].reduce((sum, count) => sum + count, 0);
  }

  // Sends a move. Buttons are disabled while it's on its way, so a double-click can't send it twice
  async #run(request) {
    if (this.#busy) return null;
    this.#busy = true;
    this.#render();
    try {
      const { state, events } = await request();
      this.#apply(state, events);
      return events;
    } catch (err) {
      toast(err.message, 'error');
      await this.#refresh();
      return null;
    } finally {
      this.#busy = false;
      this.#render();
    }
  }

  // New board from the server, plus the moves that led to it. The moves are played back in order
  #apply(state, events = []) {
    this.#state = state;
    if (state.phase !== 'REINFORCE') this.#allocations.clear();
    if (state.phase !== 'PLANNING' || !state.isHumanTurn) this.#selected = null;

    const fresh = events.filter((event) => event.seq > this.#lastSeq);
    if (fresh.length) this.#lastSeq = Math.max(...fresh.map((event) => event.seq));
    this.#queue.push({ events: fresh, state });
    if (!this.#playing) this.#playBack();
  }

  async #playBack() {
    this.#playing = true;
    let othersMoved = false;

    while (this.#queue.length) {
      const { events, state } = this.#queue.shift();
      for (const event of events) {
        applyEvent(this.#view, event);
        this.#feed.add([event], this.#view);

        const pause = this.#pauseFor(event);
        if (pause) {
          othersMoved = true;
          this.#showInArena(event);
          this.#render();
          await this.#wait(pause);
        }
      }
      // The server's board is always the final word
      this.#view = structuredClone(state);
    }

    this.#playing = false;
    this.#els.arena.hidden = true;
    this.#render();
    if (othersMoved && this.#state.isOwner && this.#state.isHumanTurn) toast('Your turn!');
  }

  // The player's own moves were already shown in the battle window, so they aren't replayed
  #pauseFor(event) {
    if (this.#state.isOwner && event.playerId === this.#view.humanPlayerId) return 0;
    const pause = DELAYS[event.type] ?? 0;
    return this.#fast ? Math.round(pause * FAST_FACTOR) : pause;
  }

  #wait(ms) {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.#wake = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.#wake = done;
    });
  }

  #toggleFastForward() {
    this.#fast = !this.#fast;
    try {
      localStorage.setItem(FAST_FORWARD_KEY, this.#fast ? 'on' : 'off');
    } catch {
      // not remembered next time, but still works now
    }
    if (this.#fast) this.#wake?.(); // skip the rest of the current pause
    this.#render();
  }

  async #refresh() {
    try {
      const state = await this.#api.state();
      const { events } = await this.#api.events(this.#lastSeq);
      this.#apply(state, events);
    } catch {
      // the next poll will try again
    }
  }

  // Watchers (and other tabs) pick up new moves every few seconds
  async #poll() {
    if (this.#busy || this.#playing || document.hidden || this.#dialog.open) return;
    try {
      const { events } = await this.#api.events(this.#lastSeq);
      if (!events.length) return;
      this.#apply(await this.#api.state(), events);
    } catch {
      // try again next time
    }
  }

  // Coming back to a game in the middle of a battle carries on where it left off
  #resume() {
    if (!this.#canAct) return;
    if (this.#state.phase === 'ATTACKING') this.#openBattle();
    if (this.#state.phase === 'CONQUEST_MOVE') this.#openConquestMove();
  }

  async #share() {
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Link copied. Anyone with it can watch this game.');
    } catch {
      toast(`Copy this link to share the game: ${location.href}`);
    }
  }

  // ---------- The arena: other players' moves as they happen ----------

  #showInArena(event) {
    const v = this.#view;
    const p = event.payload ?? {};
    const territory = (iso2) => v.territories.find((t) => t.iso2 === iso2);
    const player = v.players.find((pl) => pl.playerId === event.playerId);
    const { arena, arenaTurn, arenaThought, arenaFight } = this.#els;
    const summary = () => arenaFight.querySelector('.roll-summary');
    arena.hidden = false;

    switch (event.type) {
      case 'TURN_START':
        arenaTurn.textContent = `${player.name}'s turn`;
        arenaTurn.style.setProperty('--owner', player.color);
        arenaThought.textContent = '';
        arenaFight.replaceChildren();
        break;
      case 'NPC_DECISION':
        arenaThought.textContent = `🤖 ${event.justification}`;
        break;
      case 'ATTACK_START':
        arenaFight.replaceChildren(
          versus(territory(p.from), territory(p.to), p.attackerSoldiers, p.defenderSoldiers),
          el('div', { class: 'dice' }),
          el('p', { class: 'roll-summary' }),
                    el('p', { class: 'commentary' }),
        );
        break;
      case 'DICE_ROLL':
        if (!arenaFight.querySelector('.dice')) break;
        animateRoll(arenaFight.querySelector('.dice'), p.pairs, this.#fast ? 60 : 350);
        arenaFight.querySelector('[data-role="attacker"]').textContent = p.attackerSoldiers;
        arenaFight.querySelector('[data-role="defender"]').textContent = p.defenderSoldiers;
        summary().textContent = rollSummary(p, territory(p.from), territory(p.to));
                arenaFight.querySelector('.commentary').textContent = event.commentary ? `🎙️ ${event.commentary}` : '';
        break;
      case 'CONQUEST':
        if (summary()) summary().textContent = `🏳️ ${territory(p.to).name} falls to ${player.name}!`;
        break;
      case 'ATTACK_FAILED':
        if (summary()) summary().textContent = `${territory(p.from).name} is down to its last soldier. The attack fails.`;
        break;
      case 'ATTACK_STOPPED':
        if (summary()) summary().textContent = `${player.name} calls off the attack.`;
        break;
      case 'ELIMINATION': {
        const out = v.players.find((pl) => pl.playerId === p.playerId);
        arenaThought.textContent = `☠️ ${out.isHuman && v.isOwner ? 'You have' : `${out.name} has`} been eliminated.`;
        break;
      }
      default:
        break;
    }
  }

  // ---------- Drawing the page ----------

  #render() {
    this.#renderMeta();
    this.#renderBanner();
    this.#renderPlayers();
    this.#renderActions();
    this.#renderBoard();
    this.#els.fastForward.setAttribute('aria-pressed', String(this.#fast));
    this.#els.fastForward.textContent = this.#fast ? '⏩ Fast-forward: on' : '⏩ Fast-forward: off';
  }

  #renderMeta() {
    const v = this.#view;
    let turn = `${v.currentPlayer.name}'s turn`;
    if (v.status !== 'active') turn = v.statusLabel;
    else if (v.isHumanTurn) turn = v.isOwner ? 'Your turn' : `${v.currentPlayer.name}'s turn (player)`;

    this.#els.meta.replaceChildren(
      el('span', { class: 'chip' }, `Round ${v.round}`),
      el('span', { class: 'chip' }, PHASE_LABELS[v.phase]),
      el('span', { class: 'chip chip-turn', style: { '--owner': v.currentPlayer.color } }, turn),
    );
  }

  #renderBanner() {
    const v = this.#view;
    const banner = this.#els.banner;
    banner.className = 'game-banner';

    if (v.status === 'won') {
      banner.classList.add('banner-won');
      banner.replaceChildren(
        el('strong', {}, '🏆 Victory!'),
        ` ${v.isOwner ? 'You' : 'The player'} conquered all 10 countries in ${plural(v.round, 'round')}.`,
        v.isOwner ? el('a', { href: '/games/new', class: 'btn btn-small' }, 'Play again') : null,
      );
    } else if (v.status === 'lost') {
      banner.classList.add('banner-lost');
      banner.replaceChildren(
        el('strong', {}, 'Defeated.'),
        ` ${v.isOwner ? 'Your' : "The player's"} last country has fallen.`,
        v.isOwner ? el('a', { href: '/games/new', class: 'btn btn-small' }, 'Try again') : null,
      );
    } else if (!v.isOwner) {
      banner.classList.add('banner-watch');
      banner.replaceChildren(
        el('strong', {}, '👀 You’re watching this game.'),
        ' New moves appear here as they happen. ',
        el('a', { href: '/games/new' }, 'Start your own game'),
      );
    } else {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
  }

  #renderPlayers() {
    const v = this.#view;
    this.#els.players.replaceChildren(
      ...v.players.map((player) =>
        el('li', {
          class: ['player', player.isCurrent && 'current', player.eliminated && 'eliminated'].filter(Boolean).join(' '),
          style: { '--owner': player.color },
        },
          el('span', { class: 'dot' }),
          el('span', { class: 'player-name' }, player.name, player.isHuman ? el('span', { class: 'you' }, v.isOwner ? ' (you)' : ' (player)') : null),
          el('span', { class: 'player-stats' },
            player.eliminated ? '☠ Eliminated' : `${plural(player.territories, 'country', 'countries')} · ${plural(player.soldiers, 'soldier')}`))),
    );
  }

  #renderActions() {
    const s = this.#state;
    const v = this.#view;
    const box = this.#els.actions;
    box.hidden = false;

    if (v.status !== 'active' || !s.isOwner) {
      box.hidden = true;
      return;
    }

    if (this.#playing || !s.isHumanTurn) {
      box.replaceChildren(el('p', {},
        el('strong', {}, `⏳ ${v.isHumanTurn ? 'Catching up…' : `${v.currentPlayer.name} is playing…`} `),
        this.#fast ? 'Fast-forward is on.' : 'Turn on ⏩ Fast-forward to speed up the other players.'));
      return;
    }

    const disabled = this.#busy;
    const button = (label, onClick, className = 'btn', extra = {}) =>
      el('button', { class: className, onClick, disabled: disabled || extra.disabled }, label);

    if (s.phase === 'REINFORCE') {
      const left = s.pendingReinforcements - this.#placed();
      box.replaceChildren(
        el('p', {},
          el('strong', {}, `Place your reinforcements: ${left} of ${s.pendingReinforcements} left. `),
          'Use + and − on your countries.'),
        el('div', { class: 'action-buttons' },
          this.#placed() ? button('Reset', () => { this.#allocations.clear(); this.#render(); }, 'btn btn-secondary') : null,
          button('Confirm reinforcements', () => this.#confirmReinforce(), 'btn', { disabled: left !== 0 })),
      );
      return;
    }

    if (s.phase === 'PLANNING') {
      const selected = this.#selected && this.#territory(this.#selected);
      const canStart = s.territories.some((t) => this.#isMine(t) && t.soldiers >= 2);
      let text;
      if (selected) {
        text = [el('strong', {}, `${selected.name} selected (${plural(selected.soldiers, 'soldier')}). `),
          'Click an enemy country to attack it, or another of your countries to move soldiers there.'];
      } else if (canStart) {
        text = [el('strong', {}, 'Your move. '), 'Click one of your countries with 2 or more soldiers to attack or move soldiers from it.'];
      } else {
        text = [el('strong', {}, 'None of your countries has enough soldiers to attack. '), 'End your turn to get reinforcements next round.'];
      }
      box.replaceChildren(
        el('p', {}, ...text),
        el('div', { class: 'action-buttons' },
          selected ? button('Cancel selection', () => { this.#selected = null; this.#render(); }, 'btn btn-secondary') : null,
          button('End turn', () => this.#endTurn(), 'btn btn-secondary')),
      );
      return;
    }

    if (s.phase === 'ATTACKING') {
      box.replaceChildren(el('p', {}, el('strong', {}, '⚔️ Battle in progress. ')),
        el('div', { class: 'action-buttons' }, button('Open the battle', () => this.#openBattle())));
      return;
    }

    if (s.phase === 'CONQUEST_MOVE') {
      box.replaceChildren(el('p', {}, el('strong', {}, '🏳️ You conquered a country. '), 'Choose how many soldiers to move in.'),
        el('div', { class: 'action-buttons' }, button('Move soldiers in', () => this.#openConquestMove())));
    }
  }

  #renderBoard() {
    this.#els.board.replaceChildren(...this.#view.territories.map((territory) => this.#card(territory)));
  }

  #card(territory) {
    const v = this.#view;
    const mine = this.#isMine(territory);
    const extra = this.#allocations.get(territory.iso2) ?? 0;
    const reinforcing = this.#canAct && this.#state.phase === 'REINFORCE';
    const planning = this.#canAct && this.#state.phase === 'PLANNING';
    const fight = v.activeAttack;

    // In planning, which cards can be clicked right now?
    let clickable = false;
    let hint = '';
    if (planning) {
      if (!this.#selected) {
        clickable = mine && territory.soldiers >= 2;
        hint = clickable ? 'Choose this country' : mine ? 'Needs 2 or more soldiers' : '';
      } else if (this.#selected === territory.iso2) {
        clickable = true;
        hint = 'Click again to cancel';
      } else {
        clickable = true;
        hint = mine ? 'Move soldiers here' : `Attack ${territory.name}`;
      }
    }

    const classes = [
      'country-card',
      mine && 'mine',
      this.#selected === territory.iso2 && 'selected',
      planning && this.#selected && this.#selected !== territory.iso2 && (mine ? 'move-target' : 'attack-target'),
      clickable && 'clickable',
      fight && fight.from === territory.iso2 && 'fight-from',
      fight && fight.to === territory.iso2 && 'fight-to',
    ].filter(Boolean).join(' ');

    const content = [
      el('div', { class: 'card-head' },
        el('img', { src: flagUrl(territory.iso2), alt: '', width: 32, height: 22, loading: 'lazy' }),
        el('span', { class: 'card-name' }, territory.name)),
      el('div', { class: 'card-soldiers' },
        String(territory.soldiers),
        extra ? el('span', { class: 'card-extra' }, ` +${extra}`) : null),
      el('div', { class: 'card-owner' }, mine && v.isOwner ? 'Yours' : territory.ownerName, ` · value ${territory.soldierValue}`),
      hint && clickable ? el('div', { class: 'card-hint' }, hint) : null,
    ];

    if (reinforcing && mine) {
      const left = this.#state.pendingReinforcements - this.#placed();
      content.push(el('div', { class: 'card-stepper' },
        el('button', { class: 'step', 'aria-label': `One fewer soldier for ${territory.name}`, disabled: extra === 0, onClick: () => this.#adjust(territory.iso2, -1) }, '−'),
        el('button', { class: 'step', 'aria-label': `One more soldier for ${territory.name}`, disabled: left === 0, onClick: () => this.#adjust(territory.iso2, 1) }, '+')));
    }

    const style = { '--owner': territory.ownerColor };
    if (planning) {
      return el('button', {
        class: classes, style, disabled: !clickable,
        'aria-label': `${territory.name}, ${mine ? 'yours' : `held by ${territory.ownerName}`}, ${plural(territory.soldiers, 'soldier')}${hint ? `. ${hint}` : ''}`,
        onClick: () => this.#onCardClick(territory),
      }, ...content);
    }
    return el('div', { class: classes, style }, ...content);
  }

  // ---------- Reinforce ----------

  #adjust(iso2, delta) {
    const next = (this.#allocations.get(iso2) ?? 0) + delta;
    if (next <= 0) this.#allocations.delete(iso2);
    else this.#allocations.set(iso2, next);
    this.#render();
  }

  async #confirmReinforce() {
    const allocations = [...this.#allocations].map(([iso2, count]) => ({ iso2, count }));
    const events = await this.#run(() => this.#api.reinforce(allocations));
    if (events) toast('Reinforcements placed.');
  }

  // ---------- Planning: choose, attack, move ----------

  #onCardClick(territory) {
    if (!this.#selected) {
      if (this.#isMine(territory) && territory.soldiers >= 2) this.#selected = territory.iso2;
    } else if (this.#selected === territory.iso2) {
      this.#selected = null;
    } else if (this.#isMine(territory)) {
      return this.#openTransfer(this.#selected, territory.iso2);
    } else {
      return this.#openAttackConfirm(this.#selected, territory.iso2);
    }
    this.#render();
  }

  async #endTurn() {
    await this.#run(() => this.#api.endTurn());
  }

  #openAttackConfirm(fromIso2, toIso2) {
    const from = this.#territory(fromIso2);
    const to = this.#territory(toIso2);
    const chance = Math.round(winChance(from.soldiers, to.soldiers) * 100);

    this.#showDialog(
      el('h2', {}, `Attack ${to.name}?`),
      versus(from, to),
      el('p', { class: 'odds' }, 'Estimated chance to conquer it: ', el('strong', {}, `${chance}%`)),
      el('p', { class: 'dialog-hint' }, 'You keep rolling until you conquer it, stop, or are down to 1 soldier. Your turn ends when the attack does.'),
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn btn-secondary', onClick: () => this.#closeDialog() }, 'Cancel'),
        el('button', { class: 'btn btn-danger', onClick: () => this.#startAttack(fromIso2, toIso2) }, '⚔️ Attack')),
    );
  }

  async #startAttack(fromIso2, toIso2) {
    const events = await this.#run(() => this.#api.attack(fromIso2, toIso2));
    if (events) this.#openBattle();
    else this.#closeDialog();
  }

  #openTransfer(fromIso2, toIso2) {
    const from = this.#territory(fromIso2);
    const to = this.#territory(toIso2);
    const max = from.soldiers - 1;
    const slider = el('input', { type: 'range', id: 'transfer-count', min: 1, max, value: Math.ceil(max / 2) });
    const label = el('output', { for: 'transfer-count', class: 'slider-value' });
    const update = () => { label.textContent = `Move ${plural(Number(slider.value), 'soldier')}`; };
    slider.addEventListener('input', update);
    update();

    this.#showDialog(
      el('h2', {}, 'Move soldiers'),
      el('p', {}, `From ${from.name} (${from.soldiers}) to ${to.name} (${to.soldiers}). 1 soldier must stay behind.`),
      el('label', { for: 'transfer-count', class: 'sr-only' }, 'Number of soldiers to move'),
      slider, label,
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn btn-secondary', onClick: () => this.#closeDialog() }, 'Cancel'),
        el('button', { class: 'btn', onClick: () => this.#confirmTransfer(fromIso2, toIso2, Number(slider.value)) }, 'Move soldiers')),
    );
  }

  async #confirmTransfer(fromIso2, toIso2, count) {
    const events = await this.#run(() => this.#api.transfer(fromIso2, toIso2, count));
    this.#closeDialog();
    if (events) {
      this.#selected = null;
      this.#render();
      toast(`Moved ${plural(count, 'soldier')} to ${this.#territory(toIso2).name}.`);
    }
  }

  // ---------- Battle ----------

  #openBattle(lastRoll = null) {
    const attack = this.#state.activeAttack;
    if (!attack) return this.#closeDialog();
    const from = this.#territory(attack.from);
    const to = this.#territory(attack.to);
    const dice = el('div', { class: 'dice' });
    const summary = el('p', { class: 'roll-summary' },
      lastRoll ? rollSummary(lastRoll, from, to) : `Each die is one soldier. ${Math.min(from.soldiers - 1, to.soldiers)} dice per side this roll.`);

    if (lastRoll) animateRoll(dice, lastRoll.pairs, 0);

    this.#showDialog(
      el('h2', {}, `${from.name} attacks ${to.name}`),
      versus(from, to),
      dice,
      summary,
            el('p', { class: 'commentary', id: 'battle-commentary' }),
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn btn-secondary', id: 'stop-btn', onClick: () => this.#stopAttack() }, 'Stop attack (ends turn)'),
        el('button', { class: 'btn btn-danger', id: 'roll-btn', onClick: () => this.#roll(from, to) }, '🎲 Roll')),
    );
  }

  async #roll(fromBefore, toBefore) {
    const buttons = this.#dialog.querySelectorAll('button');
    buttons.forEach((b) => { b.disabled = true; });

    const events = await this.#run(() => this.#api.roll());
    if (!events) return this.#openBattle();

    const roll = events.find((e) => e.type === 'DICE_ROLL')?.payload;
    const conquest = events.find((e) => e.type === 'CONQUEST')?.payload;
    const failed = events.some((e) => e.type === 'ATTACK_FAILED');
    const won = events.some((e) => e.type === 'GAME_WON');

    // Animate in the open dialog, using the numbers from the roll itself
    const dice = this.#dialog.querySelector('.dice');
    if (roll && dice) {
      await animateRoll(dice, roll.pairs);
      this.#dialog.querySelector('[data-role="attacker"]').textContent = roll.attackerSoldiers;
      this.#dialog.querySelector('[data-role="defender"]').textContent = roll.defenderSoldiers;
      this.#dialog.querySelector('.roll-summary').textContent = rollSummary(roll, fromBefore, toBefore);
            const commentary = events.find((e) => e.type === 'DICE_ROLL')?.commentary;
      this.#dialog.querySelector('#battle-commentary').textContent = commentary ? `🎙️ ${commentary}` : '';

    }

    const actions = this.#dialog.querySelector('.dialog-actions');
    const close = (label = 'Close') => el('button', { class: 'btn', onClick: () => this.#closeDialog() }, label);

    if (won) {
      actions.replaceChildren(el('p', { class: 'outcome outcome-win' }, `🏆 ${toBefore.name} falls and the world is yours!`), close('See the board'));
    } else if (conquest) {
      actions.replaceChildren(
        el('p', { class: 'outcome outcome-win' }, `🏳️ ${toBefore.name} is yours! It starts with ${plural(conquest.bonus, 'soldier')}.`),
        el('button', { class: 'btn', onClick: () => this.#openConquestMove() }, 'Move soldiers in'),
      );
    } else if (failed) {
      actions.replaceChildren(
        el('p', { class: 'outcome outcome-lose' }, `${fromBefore.name} is down to its last soldier. The attack fails and your turn ends.`),
        close('See what the others do'),
      );
    } else {
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  async #stopAttack() {
    const events = await this.#run(() => this.#api.stop());
    if (events) this.#closeDialog();
  }

  #openConquestMove() {
    const attack = this.#state.activeAttack;
    if (!attack) return this.#closeDialog();
    const from = this.#territory(attack.from);
    const to = this.#territory(attack.to);
    const max = from.soldiers - 1;

    if (max === 0) {
      this.#showDialog(
        el('h2', {}, `${to.name} is yours!`),
        el('p', {}, `${from.name} has no soldiers to spare, so ${to.name} keeps its ${plural(to.soldiers, 'soldier')}.`),
        el('div', { class: 'dialog-actions' }, el('button', { class: 'btn', onClick: () => this.#confirmConquestMove(0) }, 'Continue')),
      );
      return;
    }

    const slider = el('input', { type: 'range', id: 'move-count', min: 0, max, value: Math.floor(max / 2) });
    const label = el('output', { for: 'move-count', class: 'slider-value' });
    const update = () => { label.textContent = `Move ${plural(Number(slider.value), 'more soldier')} in`; };
    slider.addEventListener('input', update);
    update();

    this.#showDialog(
      el('h2', {}, `${to.name} is yours!`),
      el('p', {}, `It starts with ${plural(to.soldiers, 'soldier')}. Move more in from ${from.name} (${from.soldiers})? 1 soldier must stay behind.`),
      el('label', { for: 'move-count', class: 'sr-only' }, 'Number of soldiers to move'),
      slider, label,
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn', onClick: () => this.#confirmConquestMove(Number(slider.value)) }, 'Confirm')),
    );
  }

  async #confirmConquestMove(count) {
    const events = await this.#run(() => this.#api.conquestMove(count));
    if (events) this.#closeDialog();
  }

  // ---------- Dialog window ----------

  #showDialog(...children) {
    this.#dialog.replaceChildren(...children);
    if (!this.#dialog.open) this.#dialog.showModal();
  }

  #closeDialog() {
    if (this.#dialog.open) this.#dialog.close();
    this.#render();
  }
}

const root = document.getElementById('game');
const initialState = JSON.parse(document.getElementById('initial-state').textContent);
new GameScreen(root, initialState).start();
