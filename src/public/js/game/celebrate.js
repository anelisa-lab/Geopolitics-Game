import { el } from './dom.js';

const COLORS = ['#2f6be0', '#d23f3f', '#1b9157', '#d4a00a', '#7a4bd6', '#dc6f17'];

// A short burst of confetti for a victory
export function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const layer = el('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 90; i++) {
    layer.append(el('i', {
      style: {
        left: `${Math.random() * 100}%`,
        background: COLORS[i % COLORS.length],
        'animation-delay': `${(Math.random() * 0.8).toFixed(2)}s`,
        'animation-duration': `${(2.2 + Math.random() * 1.6).toFixed(2)}s`,
      },
    }));
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 5000);
}