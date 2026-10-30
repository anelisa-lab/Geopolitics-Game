const search = document.getElementById('country-search');
const options = document.querySelectorAll('.country-option');
const noResults = document.getElementById('no-results');

search.addEventListener('input', () => {
  const query = search.value.trim().toLowerCase();
  let visible = 0;

  options.forEach((option) => {
    const matches = option.dataset.name.includes(query);
    option.hidden = !matches;
    if (matches) visible++;
  });

  noResults.hidden = visible > 0;
});