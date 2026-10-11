// Tema de la app: automático (como el dispositivo), claro u oscuro.
// Es una preferencia de cada dispositivo. El script al principio de
// index.html lo aplica antes de dibujar la página; acá solo se cambia.

const STORAGE_KEY = 'pympocket.theme';
export const THEMES = ['auto', 'light', 'dark'];

export function theme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

export function setTheme(value) {
  try {
    if (value === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {}
  window.__pymApplyTheme?.();
}
