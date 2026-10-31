import { el } from './dom.js';

// A short message in the corner of the screen
export function toast(message, kind = 'info') {
  const box = document.getElementById('toasts');
  const item = el('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  box.append(item);
  setTimeout(() => item.remove(), 4500);
}
