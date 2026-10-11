// Small general-purpose helpers.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escapes text for HTML. */
export const h = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function debounce(fn, ms = 300) {
  let timer;
  const run = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  run.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return run;
}

/** Inline SVG icon from the sprite in index.html. */
export const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/**
 * Lets the browser paint (e.g. a loading state) before heavy work. The timer
 * fallback matters in background tabs, where animation frames don't run.
 */
export const nextFrame = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
    setTimeout(resolve, 80);
  });

/** Downloads text as a file. */
export function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File-name-safe version of a name. */
export const slug = (name) =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'classroom';
