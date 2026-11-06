// Applies the chosen theme before the page is drawn, so it never flashes the wrong colours.
// Choices (saved in this browser): "light" (the default), "dark", or "system" (match the device)
(function () {
  var media = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme() {
    var choice = 'light';
    try {
      choice = localStorage.getItem('geopolitics-theme') || 'light';
    } catch (err) {
      // storage blocked: stay light
    }
    var dark = choice === 'dark' || (choice === 'system' && media.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  applyTheme();
  media.addEventListener('change', applyTheme); // follows the device if it switches at sunset
  window.applyTheme = applyTheme;
})();
