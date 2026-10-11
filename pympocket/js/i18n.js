// Internacionalización: todos los textos visibles salen de un diccionario.
// Para sumar un idioma, agregar un archivo en js/i18n/ y registrarlo acá.
import es from './i18n/es.js';

const dictionaries = { es };
let lang = 'es';

export const locale = () => dictionaries[lang].locale;

/**
 * Devuelve el texto para `key` (ej. "home.title"), reemplazando {param}.
 * Las entradas pueden ser funciones para manejar plurales.
 */
export function t(key, params = {}) {
  const value = key.split('.').reduce((obj, k) => obj?.[k], dictionaries[lang]);
  if (value == null) {
    console.warn('[i18n] falta la clave', key);
    return key;
  }
  if (typeof value === 'function') return value(params);
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}

/** Acceso a listas u objetos del diccionario (ej. nombres de meses). */
export const tRaw = (key) => key.split('.').reduce((obj, k) => obj?.[k], dictionaries[lang]);
