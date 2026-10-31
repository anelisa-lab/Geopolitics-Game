import { el, flagUrl } from './dom.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ROLL_MS = reducedMotion ? 0 : 650;

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

function die(value, extraClass = '') {
  return el('span', { class: `die ${extraClass}`.trim() }, String(value));
}

// Shows the dice tumbling, then settles on the real result:
// each attacking die is matched with the defending die below it
export async function animateRoll(container, pairs) {
  const rows = pairs.map(() => ({ attack: die('?', 'rolling'), defend: die('?', 'rolling') }));
  container.replaceChildren(
    ...rows.map((row, i) =>
      el('div', { class: 'die-pair', title: `Die ${i + 1}` }, row.attack, el('span', { class: 'die-vs' }, 'vs'), row.defend)),
  );

  if (ROLL_MS) {
    const started = performance.now();
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        for (const row of rows) {
          row.attack.textContent = 1 + Math.floor(Math.random() * 6);
          row.defend.textContent = 1 + Math.floor(Math.random() * 6);
        }
        if (performance.now() - started >= ROLL_MS) {
          clearInterval(timer);
          resolve();
        }
      }, 70);
    });
  }

  pairs.forEach((pair, i) => {
    const { attack, defend } = rows[i];
    attack.textContent = pair.attack;
    defend.textContent = pair.defend;
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
