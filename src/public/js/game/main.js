import { createApi } from './api.js';
import { el, flagUrl, plural } from './dom.js';
import { Feed } from './feed.js';
import { versus, animateRoll, rollSummary } from './battle.js';
import { applyEvent } from './replay.js';
import { winChance } from './odds.js';
import { toast } from './toast.js';
import { celebrate } from './celebrate.js';
import * as sound from './sound.js';

const POLL_MS = 15000; // a backup check, in case the live connection drops
const HISTORY_SIZE = 150; // how many past events the feed shows when the page opens
const FLASH_MS = 1600;     // how long a country flashes after changing hands

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
  #gameId;
  #updateWaiting = false;    // news arrived while the screen was busy: check again when it's free
  #summary = null;           // the game-over stats
  #summaryRequested = false;
  #owners = new Map();       // who owned each country at the last redraw
  #flashes = new Map();      // countries that just changed hands, and when

  constructor(root, initialState) {
    this.#api = createApi(root.dataset.gameId);
    this.#gameId = root.dataset.gameId;
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
      live: document.getElementById('live-badge'),
      sound: document.getElementById('sound-btn'),
    };

    try {
      this.#fast = localStorage.getItem(FAST_FORWARD_KEY) === 'on';
    } catch {
      // storage blocked: start at normal speed
    }

    document.getElementById('share-btn').addEventListener('click', () => this.#share());
    this.#els.fastForward.addEventListener('click', () => this.#toggleFastForward());
    this.#els.sound.addEventListener('click', () => this.#toggleSound());

    // Escape mustn't close the window in the middle of a battle or conquest
    this.#dialog.addEventListener('cancel', (event) => {
      if (['ATTACKING', 'CONQUEST_MOVE'].includes(this.#state.phase)) event.preventDefault();
    });
  }

  async start() {
    this.#render();
    try {
      // The latest part of the history goes straight into the feed (no need to replay it).
      // Event numbers have no gaps, so "after eventSeq - 150" means "the last 150"
      const latest = this.#state.eventSeq ?? 0;
      const { events } = await this.#api.events(Math.max(0, latest - HISTORY_SIZE));
      this.#feed.add(events, this.#view);
      this.#lastSeq = Math.max(latest, ...events.map((event) => event.seq));
    } catch {
      toast('The game history could not be loaded. Refresh to try again.', 'error');
    }
    this.#resume();
    this.#connectLive();
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
      this.#checkWaiting();
    }
  }

  // New board from the server, plus the moves that led to it. The moves are played back in order
  #apply(state, events = []) {
    const justWon = this.#state.status === 'active' && state.status === 'won';
    const justLost = this.#state.status === 'active' && state.status === 'lost';
    this.#state = state;
    if (justWon) {
      celebrate();
      sound.play('victory');
    }
    if (justLost && state.isOwner) sound.play('defeat');
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
    this.#checkWaiting();
    if (othersMoved && this.#state.isOwner && this.#state.isHumanTurn) {
      toast('Your turn!');
      sound.play('turn');
    }
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

  #toggleSound() {
    sound.setMuted(!sound.isMuted());
    if (!sound.isMuted()) sound.play('tie'); // a little beep, so you know it's on
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
    if (this.#busy || this.#playing || document.hidden || this.#dialog.open) {
      this.#updateWaiting = true; // check again as soon as the screen is free
      return;
    }
    try {
      const { events } = await this.#api.events(this.#lastSeq);
      if (!events.length) return;
      this.#apply(await this.#api.state(), events);
    } catch {
      // try again next time
    }
  }

  // ---------- Live spectating (bonus feature) ----------

  // The server tells everyone watching this game the moment a move is saved
  #connectLive() {
    if (typeof window.io !== 'function') return; // no live connection: the backup check still works
    const socket = window.io();
    const badge = this.#els.live;

    socket.on('connect', () => socket.emit('watch', this.#gameId)); // also runs again after a reconnect
    socket.on('game:updated', () => this.#poll());
    socket.on('viewers', (count) => {
      badge.textContent = `🔴 LIVE · ${plural(count, 'viewer')}`;
      badge.hidden = false;
    });
    socket.on('disconnect', () => { badge.hidden = true; });
  }

  #checkWaiting() {
    if (!this.#updateWaiting) return;
    this.#updateWaiting = false;
    this.#poll();
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
      case 'DICE_ROLL': {
        const dice = arenaFight.querySelector('.dice');
        if (!dice) break;
        const from = territory(p.from);
        const to = territory(p.to);
        if (!this.#fast) sound.play('roll', 0.5);
        // Show the numbers and words once the dice have landed, so they always match
        animateRoll(dice, p.pairs, this.#fast ? 60 : 350).then(() => {
          if (!dice.isConnected) return; // the arena has already moved on to the next move
          arenaFight.querySelector('[data-role="attacker"]').textContent = p.attackerSoldiers;
          arenaFight.querySelector('[data-role="defender"]').textContent = p.defenderSoldiers;
          summary().textContent = rollSummary(p, from, to);
          arenaFight.querySelector('.commentary').textContent = event.commentary ? `🎙️ ${event.commentary}` : '';
        });
        break;
      }
      case 'CONQUEST':
        if (summary()) summary().textContent = `🏳️ ${territory(p.to).name} falls to ${player.name}!`;
        // Losing one of your own countries gets its own warning sound
        if (v.isOwner && p.defenderPlayerId === v.humanPlayerId) sound.play('lostCountry');
        else if (!this.#fast) sound.play('conquest', 0.4);
        break;
      case 'ATTACK_FAILED':
        if (summary()) summary().textContent = `${territory(p.from).name} is down to its last soldier. The attack fails.`;
        break;
      case 'ATTACK_STOPPED':
        if (summary()) summary().textContent = `${player.name} calls off the attack.`;
        break;
      case 'ELIMINATION': {
        const out = v.players.find((pl) => pl.playerId === p.playerId);
        if (!this.#fast) sound.play('elimination', 0.6);
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
    this.#els.sound.setAttribute('aria-pressed', String(!sound.isMuted()));
    this.#els.sound.textContent = sound.isMuted() ? '🔇 Sound: off' : '🔊 Sound: on';
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

    if (v.status === 'won' || v.status === 'lost') {
      const won = v.status === 'won';
      banner.classList.add(won ? 'banner-won' : 'banner-lost');
      const headline = won
        ? [el('strong', {}, '🏆 Victory!'), ` ${v.isOwner ? 'You' : 'The player'} conquered all 10 countries in ${plural(v.round, 'round')}.`]
        : [el('strong', {}, 'Defeated.'), ` ${v.isOwner ? 'Your' : "The player's"} last country fell in round ${v.round}.`];
      banner.replaceChildren(
        el('div', { class: 'banner-text' }, ...headline, this.#statsList()),
        v.isOwner ? el('a', { href: '/games/new', class: 'btn btn-small' }, won ? 'Play again' : 'Try again') : null,
      );
      this.#loadSummary();
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

  // The player's battle record for this game, shown once it's over
  #statsList() {
    const s = this.#summary;
    if (!s) return null;
    const stat = (value, label) => el('li', {}, el('strong', {}, String(value)), ` ${label}`);
    return el('ul', { class: 'game-stats' },
      stat(s.attacks, s.attacks === 1 ? 'attack' : 'attacks'),
      stat(s.conquests, s.conquests === 1 ? 'country conquered' : 'countries conquered'),
      stat(s.rolls, s.rolls === 1 ? 'dice roll' : 'dice rolls'),
      stat(s.enemiesDefeated, s.enemiesDefeated === 1 ? 'enemy soldier defeated' : 'enemy soldiers defeated'),
      stat(s.soldiersLost, s.soldiersLost === 1 ? 'soldier lost attacking' : 'soldiers lost attacking'));
  }

  #loadSummary() {
    if (this.#summaryRequested) return;
    this.#summaryRequested = true;
    this.#api.summary()
      .then((summary) => {
        this.#summary = summary;
        this.#render();
      })
      .catch(() => {
        // the banner still works without the numbers
      });
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
    // Spot countries that changed hands since the last redraw, so they can flash
    const now = performance.now();
    for (const territory of this.#view.territories) {
      const before = this.#owners.get(territory.iso2);
      if (before && before !== territory.ownerPlayerId) this.#flashes.set(territory.iso2, now);
      this.#owners.set(territory.iso2, territory.ownerPlayerId);
    }
    this.#els.board.replaceChildren(...this.#view.territories.map((territory) => this.#card(territory)));
  }

  #card(territory) {
    const v = this.#view;
    const mine = this.#isMine(territory);
    const extra = this.#allocations.get(territory.iso2) ?? 0;
    const reinforcing = this.#canAct && this.#state.phase === 'REINFORCE';
    const planning = this.#canAct && this.#state.phase === 'PLANNING';
    const fight = v.activeAttack;
    // The board is redrawn often, so a flash carries on from where it had got to
    const flashAge = performance.now() - (this.#flashes.get(territory.iso2) ?? -Infinity);
    const flashing = flashAge < FLASH_MS;

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
      flashing && 'flash',
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
    if (flashing) style['--flash-delay'] = `-${Math.round(flashAge)}ms`;
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
      sound.play('roll');
      await animateRoll(dice, roll.pairs);
      sound.play(conquest ? 'conquest' : sound.rollResult(roll));
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
    this.#checkWaiting();
  }
}

const root = document.getElementById('game');
const initialState = JSON.parse(document.getElementById('initial-state').textContent);
new GameScreen(root, initialState).start();
