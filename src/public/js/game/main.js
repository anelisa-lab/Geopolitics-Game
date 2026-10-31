import { createApi } from './api.js';
import { el, flagUrl, plural } from './dom.js';
import { Feed } from './feed.js';
import { versus, animateRoll, rollSummary } from './battle.js';
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

// Runs the game page: draws the board from the game's state, turns clicks into moves,
// and keeps the page up to date for players and watchers
class GameScreen {
  #api;
  #state;
  #feed;
  #dialog;
  #els;
  #lastSeq = 0;
  #busy = false;
  #selected = null;          // the player's country chosen to attack or move from
  #allocations = new Map();  // reinforcements placed but not yet confirmed

  constructor(root, initialState) {
    this.#api = createApi(root.dataset.gameId);
    this.#state = initialState;
    this.#feed = new Feed(document.getElementById('feed'));
    this.#dialog = document.getElementById('dialog');
    this.#els = {
      meta: document.getElementById('game-meta'),
      banner: document.getElementById('banner'),
      players: document.getElementById('players'),
      actions: document.getElementById('actions'),
      board: document.getElementById('board'),
    };

    document.getElementById('share-btn').addEventListener('click', () => this.#share());

    // Escape mustn't close the window in the middle of a battle or conquest
    this.#dialog.addEventListener('cancel', (event) => {
      if (['ATTACKING', 'CONQUEST_MOVE'].includes(this.#state.phase)) event.preventDefault();
    });
  }

  async start() {
    this.#render();
    try {
      const { events } = await this.#api.events(0);
      this.#applyEvents(events);
    } catch {
      toast('The game history could not be loaded. Refresh to try again.', 'error');
    }
    this.#resume();
    setInterval(() => this.#poll(), POLL_MS);
  }

  // ---------- Helpers ----------

  get #canAct() {
    return this.#state.isOwner && this.#state.isHumanTurn && !this.#busy;
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

  #apply(state, events = []) {
    this.#state = state;
    this.#applyEvents(events);
    if (state.phase !== 'REINFORCE') this.#allocations.clear();
    if (state.phase !== 'PLANNING' || !state.isHumanTurn) this.#selected = null;
  }

  #applyEvents(events) {
    if (!events.length) return;
    this.#feed.add(events, this.#state);
    this.#lastSeq = Math.max(this.#lastSeq, ...events.map((event) => event.seq));
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
    if (this.#busy || document.hidden || this.#dialog.open) return;
    try {
      const { events } = await this.#api.events(this.#lastSeq);
      if (!events.length) return;
      this.#apply(await this.#api.state(), events);
      this.#render();
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

  // ---------- Drawing the page ----------

  #render() {
    this.#renderMeta();
    this.#renderBanner();
    this.#renderPlayers();
    this.#renderActions();
    this.#renderBoard();
  }

  #renderMeta() {
    const s = this.#state;
    let turn = `${s.currentPlayer.name}'s turn`;
    if (s.status !== 'active') turn = s.statusLabel;
    else if (s.isHumanTurn) turn = s.isOwner ? 'Your turn' : `${s.currentPlayer.name}'s turn (player)`;

    this.#els.meta.replaceChildren(
      el('span', { class: 'chip' }, `Round ${s.round}`),
      el('span', { class: 'chip' }, PHASE_LABELS[s.phase]),
      el('span', { class: 'chip chip-turn', style: { '--owner': s.currentPlayer.color } }, turn),
    );
  }

  #renderBanner() {
    const s = this.#state;
    const banner = this.#els.banner;
    banner.className = 'game-banner';

    if (s.status === 'won') {
      banner.classList.add('banner-won');
      banner.replaceChildren(
        el('strong', {}, '🏆 Victory!'),
        ` ${s.isOwner ? 'You' : 'The player'} conquered all 10 countries in ${plural(s.round, 'round')}.`,
        s.isOwner ? el('a', { href: '/games/new', class: 'btn btn-small' }, 'Play again') : null,
      );
    } else if (s.status === 'lost') {
      banner.classList.add('banner-lost');
      banner.replaceChildren(
        el('strong', {}, 'Defeated.'),
        ` ${s.isOwner ? 'Your' : "The player's"} last country has fallen.`,
        s.isOwner ? el('a', { href: '/games/new', class: 'btn btn-small' }, 'Try again') : null,
      );
    } else if (!s.isOwner) {
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
    this.#els.players.replaceChildren(
      ...this.#state.players.map((player) =>
        el('li', {
          class: ['player', player.isCurrent && 'current', player.eliminated && 'eliminated'].filter(Boolean).join(' '),
          style: { '--owner': player.color },
        },
          el('span', { class: 'dot' }),
          el('span', { class: 'player-name' }, player.name, player.isHuman ? el('span', { class: 'you' }, this.#state.isOwner ? ' (you)' : ' (player)') : null),
          el('span', { class: 'player-stats' },
            player.eliminated ? '☠ Eliminated' : `${plural(player.territories, 'country', 'countries')} · ${plural(player.soldiers, 'soldier')}`))),
    );
  }

  #renderActions() {
    const s = this.#state;
    const box = this.#els.actions;
    box.hidden = false;

    if (s.status !== 'active' || !s.isOwner) {
      box.hidden = true;
      return;
    }

    if (!s.isHumanTurn) {
      box.replaceChildren(el('p', {}, `⏳ Waiting for ${s.currentPlayer.name} to play…`));
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
    this.#els.board.replaceChildren(...this.#state.territories.map((territory) => this.#card(territory)));
  }

  #card(territory) {
    const s = this.#state;
    const mine = this.#isMine(territory);
    const extra = this.#allocations.get(territory.iso2) ?? 0;
    const reinforcing = this.#canAct && s.phase === 'REINFORCE';
    const planning = this.#canAct && s.phase === 'PLANNING';

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
        hint = mine ? `Move soldiers here` : `Attack ${territory.name}`;
      }
    }

    const classes = [
      'country-card',
      mine && 'mine',
      this.#selected === territory.iso2 && 'selected',
      planning && this.#selected && this.#selected !== territory.iso2 && (mine ? 'move-target' : 'attack-target'),
      clickable && 'clickable',
    ].filter(Boolean).join(' ');

    const content = [
      el('div', { class: 'card-head' },
        el('img', { src: flagUrl(territory.iso2), alt: '', width: 32, height: 22, loading: 'lazy' }),
        el('span', { class: 'card-name' }, territory.name)),
      el('div', { class: 'card-soldiers' },
        String(territory.soldiers),
        extra ? el('span', { class: 'card-extra' }, ` +${extra}`) : null),
      el('div', { class: 'card-owner' }, mine && s.isOwner ? 'Yours' : territory.ownerName, ` · value ${territory.soldierValue}`),
      hint && clickable ? el('div', { class: 'card-hint' }, hint) : null,
    ];

    if (reinforcing && mine) {
      const left = s.pendingReinforcements - this.#placed();
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
    const events = await this.#run(() => this.#api.endTurn());
    if (events) toast(this.#state.isHumanTurn ? 'The other players have moved. Your turn again.' : 'Turn ended.');
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

    if (lastRoll) {
      // Show the last roll's settled dice when redrawing
      animateRoll(dice, lastRoll.pairs);
    }

    this.#showDialog(
      el('h2', {}, `${from.name} attacks ${to.name}`),
      versus(from, to),
      dice,
      summary,
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
        close(),
      );
    } else {
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  async #stopAttack() {
    const events = await this.#run(() => this.#api.stop());
    if (events) {
      this.#closeDialog();
      toast('Attack called off. Your turn is over.');
    }
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
    if (events) {
      this.#closeDialog();
      toast(this.#state.isHumanTurn ? 'The other players have moved. Your turn again.' : 'Turn over.');
    }
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
