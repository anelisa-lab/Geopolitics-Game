// Builds page elements safely: text is always inserted as text, never as HTML,
// so a country or game name can never inject code into the page
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key === 'style') for (const [prop, val] of Object.entries(value)) node.style.setProperty(prop, val);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const flagUrl = (iso2) => `https://flagcdn.com/w80/${iso2.toLowerCase()}.png`;

// "1 soldier", "3 soldiers", "2 countries"
export const plural = (count, word, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`;
