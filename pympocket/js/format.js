// Formatos locales (español rioplatense): montos, fechas y porcentajes.
import { locale } from './i18n.js';

export const CURRENCIES = ['ARS', 'USD', 'EUR'];
export const SYMBOLS = { ARS: '$', USD: 'US$', EUR: '€' };

const numberFormats = new Map();
function nf(min, max) {
  const key = `${min}-${max}`;
  if (!numberFormats.has(key)) {
    numberFormats.set(
      key,
      new Intl.NumberFormat(locale(), { minimumFractionDigits: min, maximumFractionDigits: max }),
    );
  }
  return numberFormats.get(key);
}

/** $ 1.234,50 · US$ 10,00 · € 5,25 */
export function money(amount, currency, { sign = false, decimals = 2 } = {}) {
  const abs = nf(decimals, decimals).format(Math.abs(amount));
  const prefix = amount < 0 ? '−' : sign && amount > 0 ? '+' : '';
  return `${prefix}${SYMBOLS[currency] ?? currency} ${abs}`;
}

/** Versión abreviada para gráficos: $ 1,2 M */
export function moneyShort(amount, currency) {
  const f = new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 });
  return `${SYMBOLS[currency] ?? currency} ${f.format(amount)}`;
}

/** Recibe una proporción (0.325) y devuelve "32,5 %". */
export function percent(ratio, decimals = 1) {
  if (!Number.isFinite(ratio)) return '—';
  return `${nf(0, decimals).format(ratio * 100)} %`;
}

/** Monto para editar en un campo: 1234,5 */
export const amountForInput = (n) => (n == null ? '' : String(n).replace('.', ','));

/**
 * Interpreta montos escritos a mano: "1.234,56", "1234,5", "1234.56", "1.500".
 * La coma es separador decimal; el punto, de miles (salvo "12.5").
 */
export function parseAmount(input) {
  if (typeof input === 'number') return input;
  let s = String(input ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    const parts = s.split(',');
    s = parts.length === 2 ? parts.join('.') : parts.join('');
  } else if (lastDot > -1) {
    const parts = s.split('.');
    if (parts.length > 2 || parts.at(-1).length === 3) s = parts.join('');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

// ---------- Fechas (siempre en formato local YYYY-MM-DD) ----------

const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

/** 10/10/2026 */
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** "sábado, 10 de octubre" */
export function formatDateLong(iso) {
  const s = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(parseISO(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const monthKey = (iso) => iso.slice(0, 7);
export const currentMonth = () => monthKey(todayISO());

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthsBetween(fromKey, toKey) {
  const [y1, m1] = fromKey.split('-').map(Number);
  const [y2, m2] = toKey.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export const daysInMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/** Primer y último día de un mes. */
export const monthRange = (key) => [`${key}-01`, `${key}-${pad(daysInMonth(key))}`];

/** "Octubre de 2026" */
export function monthLabel(key, { short = false } = {}) {
  const opts = short ? { month: 'short' } : { month: 'long', year: 'numeric' };
  const s = new Intl.DateTimeFormat(locale(), opts).format(parseISO(`${key}-01`)).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
