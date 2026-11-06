// Sound effects, made in the browser with the Web Audio API: no audio files needed.
// Browsers only allow sound after the visitor has clicked something on the page,
// so a watcher who hasn't clicked yet simply hears nothing.
const MUTE_KEY = 'geopolitics-sound';

let context = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === 'off';
} catch {
  // storage blocked: sound stays on
}

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? 'off' : 'on');
  } catch {
    // not remembered next time, but still works now
  }
}

function audio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  context ??= new AudioContextClass();
  if (context.state === 'suspended') context.resume();
  return context;
}

// One note that fades in and out quickly, so it never clicks
function tone(ac, frequency, start, duration, { type = 'sine', volume = 0.15, slideTo = null } = {}) {
  const at = ac.currentTime + start;
  const oscillator = ac.createOscillator();
  const gain = ac.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, at + duration);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(ac.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.05);
}

// A short burst of noise, like a die hitting the table
function clack(ac, start, volume) {
  const at = ac.currentTime + start;
  const length = Math.floor(ac.sampleRate * 0.04);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = 1800 + Math.random() * 1200;
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(ac.destination);
  source.start(at);
}

const SOUNDS = {
  roll: (ac, v) => { for (let i = 0; i < 6; i++) clack(ac, i * 0.06 + Math.random() * 0.02, 0.5 * v); },
  hit: (ac, v) => tone(ac, 520, 0, 0.18, { type: 'triangle', volume: 0.18 * v, slideTo: 780 }),
  miss: (ac, v) => tone(ac, 260, 0, 0.22, { type: 'triangle', volume: 0.18 * v, slideTo: 170 }),
  tie: (ac, v) => tone(ac, 440, 0, 0.12, { type: 'sine', volume: 0.12 * v }),
  conquest: (ac, v) => [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.09, i === 3 ? 0.35 : 0.12, { type: 'triangle', volume: 0.16 * v })),
  lostCountry: (ac, v) => [392, 311].forEach((f, i) => tone(ac, f, i * 0.16, 0.3, { type: 'sawtooth', volume: 0.06 * v })),
  elimination: (ac, v) => [392, 330, 262].forEach((f, i) => tone(ac, f, i * 0.14, 0.22, { type: 'square', volume: 0.05 * v })),
  turn: (ac, v) => { tone(ac, 880, 0, 0.3, { volume: 0.1 * v }); tone(ac, 1320, 0.12, 0.4, { volume: 0.08 * v }); },
  victory: (ac, v) => {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.13, i === 5 ? 0.8 : 0.14, { type: 'triangle', volume: 0.18 * v }));
    [523, 659, 784].forEach((f) => tone(ac, f, 0.78, 0.9, { volume: 0.06 * v }));
  },
  defeat: (ac, v) => [392, 370, 349, 262].forEach((f, i) => tone(ac, f, i * 0.32, i === 3 ? 0.9 : 0.3, { type: 'sine', volume: 0.14 * v })),
};

// Plays a sound by name. `volume` from 0 to 1 makes background sounds (NPC battles) quieter
export function play(name, volume = 1) {
  if (muted || !SOUNDS[name]) return;
  try {
    const ac = audio();
    if (ac) SOUNDS[name](ac, volume);
  } catch {
    // sound is a nice extra: never let it break the game
  }
}

// The sound for one roll's result, from the attacker's point of view
export function rollResult(payload, attackerIsYou = true) {
  const better = payload.defenderLosses > payload.attackerLosses;
  const worse = payload.attackerLosses > payload.defenderLosses;
  if (!better && !worse) return 'tie';
  return better === attackerIsYou ? 'hit' : 'miss';
}
