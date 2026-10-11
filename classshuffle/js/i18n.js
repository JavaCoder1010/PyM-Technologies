// Localization: every visible text comes from a dictionary in js/i18n/.
// To add a language: create js/i18n/<code>.js with the same keys as en.js and
// register it in DICTIONARIES.
import en from './i18n/en.js';

const DICTIONARIES = { en };
const FALLBACK = 'en';
let lang = FALLBACK;

export const locale = () => DICTIONARIES[lang].locale;

const lookup = (dict, key) => key.split('.').reduce((obj, k) => obj?.[k], dict);

/**
 * Text for `key` (e.g. "students.title") with {param} placeholders filled in.
 * Entries can be functions (for plurals and lists).
 */
export function t(key, params = {}) {
  let value = lookup(DICTIONARIES[lang], key);
  if (value == null && lang !== FALLBACK) value = lookup(DICTIONARIES[FALLBACK], key);
  if (value == null) {
    console.warn('[i18n] missing key', key);
    return key;
  }
  if (typeof value === 'function') return value(params);
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}

/** "Alex", "Alex and Sam", "Alex, Sam and Kai". */
export function list(items) {
  const and = t('common.and');
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1)}`;
}

export const formatDate = (iso) =>
  new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const formatDay = (iso) => new Date(iso).toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' });
