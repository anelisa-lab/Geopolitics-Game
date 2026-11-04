import { LlmClient } from './LlmClient.js';
import { env } from '../config/env.js';

// Gives every dice roll a line of live commentary, written by the AI.
// All the rolls from one move go to the AI in a single request (one roll when you
// click Roll, several battles when the NPCs play), which keeps the game quick and
// saves free-tier quota. If the AI is slow, down, gives a bad answer or isn't set up,
// ready-made lines are used instead, so the game never waits for it.
export class CommentaryService {
  #llm;

  constructor(llm) {
    this.#llm = llm;
  }

  async annotate(events, game) {
    const battles = groupBattles(events, game);
    if (!battles.length) return;

    let lines = null;
    if (this.#llm?.isConfigured) {
      const rolls = battles.reduce((sum, battle) => sum + battle.rolls.length, 0);
      try {
        const answer = await this.#llm.complete(buildPrompt(battles), {
          maxTokens: Math.min(4000, 150 + rolls * 80),
          timeoutMs: Math.min(15000, 5000 + rolls * 300), // more rolls, a little more time
          attempts: 1, // no second try: the ready-made lines are good enough
        });
        lines = parseLines(answer, battles);
      } catch (err) {
        console.warn(`AI commentary unavailable, using ready-made lines: ${err.message}`);
      }
    }

    battles.forEach((battle, b) => {
      battle.rolls.forEach((roll, r) => {
        roll.event.commentary = lines?.[b]?.[r] || fallbackLine(battle, roll);
      });
    });
  }
}

// Splits the events into battles: the dice rolls of one attack, and how each roll ended
function groupBattles(events, game) {
  const country = new Map(game.territories.map((t) => [t.iso2, t.name]));
  const battles = [];
  let current = null;

  events.forEach((event, i) => {
    if (event.type === 'ATTACK_START') current = null;
    if (event.type !== 'DICE_ROLL') return;

    const p = event.payload;
    const key = `${event.playerId}:${p.from}:${p.to}`;
    if (!current || current.key !== key) {
      current = { key, attacker: country.get(p.from), defender: country.get(p.to), rolls: [] };
      battles.push(current);
    }

    const next = events[i + 1]?.type;
    const outcome = next === 'CONQUEST' ? 'conquest' : next === 'ATTACK_FAILED' ? 'failed' : 'continues';
    current.rolls.push({ event, outcome });
  });
  return battles;
}

function buildPrompt(battles) {
  const described = battles.map((battle, b) => {
    const rolls = battle.rolls.map(({ event, outcome }) => {
      const p = event.payload;
      const dice = p.pairs.map((d) => `${d.attack}v${d.defend}`).join(', ');
      let text = `  Roll ${p.roll}: dice ${dice}. ${battle.attacker} loses ${p.attackerLosses}, ${battle.defender} loses ${p.defenderLosses}. Now ${p.attackerSoldiers} vs ${p.defenderSoldiers}.`;
      if (outcome === 'conquest') text += ` ${battle.defender} is conquered!`;
      if (outcome === 'failed') text += ` ${battle.attacker} is down to its last soldier and the attack fails.`;
      return text;
    });
    return [`Battle ${b + 1}: ${battle.attacker} attacks ${battle.defender}.`, ...rolls].join('\n');
  });

  return [
    'You are an energetic war-room sports commentator for a Risk-style board game.',
    'Write one vivid sentence (at most 20 words) for each dice roll below, in order.',
    'In each dice pair like "5v2", the first number is the attacker\'s die.',
    'Use game terms only: no real-world politics, no graphic violence, no emojis, and never invent numbers.',
    `Reply with JSON only: an array of ${battles.length} inner array(s), one per battle, each with one string per roll.`,
    '',
    ...described,
  ].join('\n');
}

// Reads the AI's answer. Anything missing or malformed is simply left out,
// and those rolls get a ready-made line instead
function parseLines(answer, battles) {
  const json = answer.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const data = JSON.parse(json);
  if (!Array.isArray(data)) throw new Error('the answer was not a list');

  const tidy = (line) => (typeof line === 'string' && line.trim() ? line.replace(/\s+/g, ' ').trim().slice(0, 220) : null);
  return battles.map((battle, b) =>
    battle.rolls.map((_, r) => {
      if (Array.isArray(data[b])) return tidy(data[b][r]);
      return battles.length === 1 ? tidy(data[r]) : null; // a flat list is fine for a single battle
    }));
}

const pick = (options) => options[Math.floor(Math.random() * options.length)];

export function fallbackLine({ attacker, defender }, { event, outcome }) {
  const p = event.payload;
  if (outcome === 'conquest') return pick([`${attacker} breaks through and ${defender} falls!`, `It's over: ${defender} is conquered by ${attacker}!`]);
  if (outcome === 'failed') return pick([`${attacker} runs out of soldiers and the assault collapses.`, `${defender} holds on: ${attacker} has nothing left to throw.`]);
  if (!p.attackerLosses && !p.defenderLosses) return pick(['Dead even! Every die is tied and nobody falls.', 'Stalemate on the dice: both armies hold their ground.']);
  if (!p.attackerLosses) return pick([`${attacker} wins every die: ${defender} loses ${p.defenderLosses}.`, `A clean sweep for ${attacker}, and ${defender} is reeling!`]);
  if (!p.defenderLosses) return pick([`${defender} stands firm and ${attacker} loses ${p.attackerLosses}.`, `A wall of defence from ${defender}!`]);
  return pick([`Blow for blow: ${attacker} loses ${p.attackerLosses}, ${defender} loses ${p.defenderLosses}.`, 'Neither side gives an inch in this exchange.']);
}

export const commentaryService = new CommentaryService(
  new LlmClient({ apiKey: env.llmApiKey, baseUrl: env.llmBaseUrl, model: env.llmModel }),
);