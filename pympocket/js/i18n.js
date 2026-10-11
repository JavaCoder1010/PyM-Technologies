// Internacionalización: todos los textos visibles salen de un diccionario.
// Para sumar un idioma: crear js/i18n/<código>.js con las mismas claves que
// es.js, registrarlo en DICTIONARIES y agregarlo a LANGUAGES.
import es from './i18n/es.js';
import en from './i18n/en.js';
import pt from './i18n/pt.js';

const DICTIONARIES = { es, en, pt };
/** Idiomas disponibles, con su nombre en el propio idioma. */
export const LANGUAGES = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
  { code: 'pt', name: 'Português' },
];
const STORAGE_KEY = 'pympocket.lang';

/** Idioma elegido en este dispositivo o, si no hay, el del navegador (español por defecto). */
function detect() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTIONARIES[saved]) return saved;
  } catch {}
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = String(tag).slice(0, 2).toLowerCase();
    if (DICTIONARIES[code]) return code;
  }
  return 'es';
}

let lang = detect();
document.documentElement.lang = DICTIONARIES[lang].locale;

export const language = () => lang;
export const locale = () => DICTIONARIES[lang].locale;

/** Cambia el idioma y recarga la app para redibujar todo con los nuevos formatos. */
export function setLanguage(code) {
  if (!DICTIONARIES[code] || code === lang) return;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {}
  location.reload();
}

const lookup = (dict, key) => key.split('.').reduce((obj, k) => obj?.[k], dict);

/**
 * Devuelve el texto para `key` (ej. "home.title"), reemplazando {param}.
 * Las entradas pueden ser funciones para manejar plurales. Si falta en el
 * idioma actual, se usa el español.
 */
export function t(key, params = {}) {
  let value = lookup(DICTIONARIES[lang], key);
  if (value == null && lang !== 'es') value = lookup(es, key);
  if (value == null) {
    console.warn('[i18n] falta la clave', key);
    return key;
  }
  if (typeof value === 'function') return value(params);
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}

/** Acceso a listas u objetos del diccionario (ej. nombres de días). */
export const tRaw = (key) => lookup(DICTIONARIES[lang], key) ?? lookup(es, key);
