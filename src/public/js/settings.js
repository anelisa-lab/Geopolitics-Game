// The ⚙️ Settings window (on every page). Settings are saved in this browser.
const KEYS = { theme: 'geopolitics-theme', sound: 'geopolitics-sound', fastForward: 'geopolitics-fast-forward' };

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not saved, but still applies until the page is closed
  }
};

const dialog = document.getElementById('settings-dialog');
const button = document.getElementById('settings-btn');

if (dialog && button) {
  const form = dialog.querySelector('form');

  button.addEventListener('click', () => {
    // Show the current settings (the game page's own buttons may have changed them)
    form.elements.theme.value = read(KEYS.theme, 'light');
    form.elements.sound.checked = read(KEYS.sound, 'on') !== 'off';
    form.elements.fastForward.checked = read(KEYS.fastForward, 'off') === 'on';
    dialog.showModal();
  });

  // Every change applies straight away
  form.addEventListener('change', () => {
    write(KEYS.theme, form.elements.theme.value);
    write(KEYS.sound, form.elements.sound.checked ? 'on' : 'off');
    write(KEYS.fastForward, form.elements.fastForward.checked ? 'on' : 'off');
    window.applyTheme?.();
    // Lets an open game page pick up sound and fast-forward changes
    window.dispatchEvent(new CustomEvent('settings-changed', {
      detail: { sound: form.elements.sound.checked, fastForward: form.elements.fastForward.checked },
    }));
  });
}
