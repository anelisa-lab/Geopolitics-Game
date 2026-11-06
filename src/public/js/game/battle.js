import { el, flagUrl } from './dom.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ROLL_MS = 650;

// Where the dots go on each face of a die (t/m/b = top/middle/bottom, l/c/r = left/centre/right)
const PIPS = {
  1: ['c'],
  2: ['tl', 'br'],
  3: ['tl', 'c', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'c', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};

// Attacker vs defender, with flags and soldier counts
export function versus(from, to, attackerSoldiers = from.soldiers, defenderSoldiers = to.soldiers) {
  const side = (territory, soldiers, role) =>
    el('div', { class: `side side-${role}`, style: { '--owner': territory.ownerColor } },
      el('img', { src: flagUrl(territory.iso2), alt: '', width: 48, height: 33 }),
      el('div', { class: 'side-name' }, territory.name),
      el('div', { class: 'side-soldiers', 'data-role': role }, String(soldiers)),
      el('div', { class: 'side-label' }, role === 'attacker' ? 'Attacking' : 'Defending'));

  return el('div', { class: 'versus' }, side(from, attackerSoldiers, 'attacker'), el('div', { class: 'vs' }, 'VS'), side(to, defenderSoldiers, 'defender'));
}

// Shows a number as dots, like a real die. Screen readers still hear the number
function setFace(die, value) {
  die.setAttribute('aria-label', value ? `Die showing ${value}` : 'Die rolling');
  die.replaceChildren(...(PIPS[value] ?? []).map((spot) => el('span', { class: `pip ${spot}` })));
}

function die(extraClass = '') {
  const face = el('span', { class: `die ${extraClass}`.trim(), role: 'img' });
  setFace(face, null);
  return face;
}

const randomFace = () => 1 + Math.floor(Math.random() * 6);

// Shows the dice tumbling, then settles on the real result:
// each attacking die is matched with the defending die below it
export async function animateRoll(container, pairs, duration = ROLL_MS) {
  const ms = reducedMotion ? 0 : duration;
  const rows = pairs.map(() => ({ attack: die('rolling'), defend: die('rolling') }));
  container.replaceChildren(
    ...rows.map((row, i) =>
      el('div', { class: 'die-pair', title: `Die ${i + 1}` }, row.attack, el('span', { class: 'die-vs' }, 'vs'), row.defend)),
  );

  if (ms) {
    const started = performance.now();
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        for (const row of rows) {
          setFace(row.attack, randomFace());
          setFace(row.defend, randomFace());
        }
        if (performance.now() - started >= ms) {
          clearInterval(timer);
          resolve();
        }
      }, 70);
    });
  }

  pairs.forEach((pair, i) => {
    const { attack, defend } = rows[i];
    setFace(attack, pair.attack);
    setFace(defend, pair.defend);
    attack.className = `die ${pair.winner === 'attacker' ? 'win' : pair.winner === 'defender' ? 'lose' : 'tie'}`;
    defend.className = `die ${pair.winner === 'defender' ? 'win' : pair.winner === 'attacker' ? 'lose' : 'tie'}`;
  });
}

export function rollSummary(payload, from, to) {
  const parts = [];
  if (payload.attackerLosses) parts.push(`${from.name} loses ${payload.attackerLosses}`);
  if (payload.defenderLosses) parts.push(`${to.name} loses ${payload.defenderLosses}`);
  return parts.length ? `${parts.join(' · ')}.` : 'A tie on every die. Nobody falls.';
}