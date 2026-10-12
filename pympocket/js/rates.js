// Cotizaciones del dólar y del euro para convertir montos entre monedas.
//
// Fuentes (siempre el valor de venta):
// - bcra: referencia oficial del BCRA (mayorista, Com. A 3500). API del BCRA.
// - bna:  billete del Banco Nación. ArgentinaDatos (casa "oficial").
// - mep:  dólar MEP o bolsa. ArgentinaDatos (casa "bolsa").       → Pro
// - blue: dólar blue (informal). ArgentinaDatos (casa "blue").    → Pro
//
// Cada movimiento se convierte con la cotización de SU fecha (o del último día
// hábil anterior). Los historiales se descargan una vez, se guardan en el
// dispositivo para usarlos sin conexión y después solo se actualizan.
// El euro: con BCRA se usa su cotización en pesos; con las demás fuentes se
// calcula con el dólar elegido y la relación euro/dólar del BCRA de esa fecha.
import * as db from './db.js';
import { state, saveRate, alive } from './store.js';
import { isPro } from './plan.js';
import { addDays, todayISO } from './format.js';

const BCRA_API = 'https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones';
const AD_API = 'https://api.argentinadatos.com/v1/cotizaciones/dolares';
const MAX_AGE_MS = 6 * 3600 * 1000;

export const SOURCES = ['bcra', 'bna', 'mep', 'blue'];
const AD_CASA = { bna: 'oficial', mep: 'bolsa', blue: 'blue' };
const PRO_SOURCES = new Set(['mep', 'blue']);

export const isProSource = (source) => PRO_SOURCES.has(source);
export const sourceAllowed = (source) => SOURCES.includes(source) && (!isProSource(source) || isPro());

/** Cotización elegida para convertir (si es Pro y el plan es gratuito, se usa la del BCRA). */
export function activeSource() {
  const source = state.settings.rateSource;
  return sourceAllowed(source) ? source : 'bcra';
}

// ---------- Última cotización del BCRA (rápida, para el arranque y sin conexión) ----------

/** Última cotización BCRA guardada: { date, USD, EUR, fetchedAt }. */
const bcraLatest = () => state.rates.reduce((best, r) => (!best || r.date > best.date ? r : best), null);

export async function refreshRates({ force = false } = {}) {
  const latest = bcraLatest();
  if (!force && latest && Date.now() - Date.parse(latest.fetchedAt) < MAX_AGE_MS) return latest;
  if (!navigator.onLine) return latest;

  const res = await fetch(BCRA_API, { cache: 'no-store' });
  if (!res.ok) throw new Error(`BCRA ${res.status}`);
  const json = await res.json();
  const detail = json?.results?.detalle ?? [];
  const pick = (code) => Number(detail.find((d) => d.codigoMoneda === code)?.tipoCotizacion);
  const rate = { date: json.results.fecha, USD: pick('USD'), EUR: pick('EUR'), fetchedAt: new Date().toISOString(), source: 'BCRA' };
  if (!(rate.USD > 0) || !(rate.EUR > 0)) throw new Error('BCRA: respuesta sin cotización');
  await saveRate(rate);
  return rate;
}

// ---------- Historiales ----------
// series: id → { id, points: [[fecha, valor, extra]] ordenados por fecha, fetchedAt }
// Ids: "bcra-USD" (pesos por dólar), "bcra-EUR" (pesos por euro, dólares por euro), "bna", "mep", "blue".

const series = new Map();

/** Carga los historiales guardados en el dispositivo (al abrir la app). */
export async function initRates() {
  series.clear();
  for (const s of await db.getAll('rateSeries')) series.set(s.id, s);
}

const stale = (s) => !s || Date.now() - Date.parse(s.fetchedAt) > MAX_AGE_MS;

async function saveSeries(id, points) {
  const rec = { id, points, fetchedAt: new Date().toISOString() };
  series.set(id, rec);
  await db.put('rateSeries', rec);
}

function merge(a, b) {
  const map = new Map(a.map((p) => [p[0], p]));
  for (const p of b) map.set(p[0], p);
  return [...map.values()].sort((x, y) => x[0].localeCompare(y[0]));
}

async function fetchBcra(code, from, to) {
  const points = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${BCRA_API}/${code}?fechadesde=${from}&fechahasta=${to}&limit=1000&offset=${offset}`, { cache: 'no-store' });
    if (res.status === 404) break; // sin datos en ese rango
    if (!res.ok) throw new Error(`BCRA ${res.status}`);
    const json = await res.json();
    for (const day of json.results ?? []) {
      const d = day.detalle?.[0];
      if (d?.tipoCotizacion > 0) points.push([day.fecha, Number(d.tipoCotizacion), Number(d.tipoPase)]);
    }
    if (offset + 1000 >= (json.metadata?.resultset?.count ?? 0)) break;
  }
  return points;
}

/** Historial del BCRA desde `from`: baja solo lo que falta (antes del primer dato o después del último). */
async function ensureBcra(code, from, force = false) {
  const id = `bcra-${code}`;
  const current = series.get(id);
  let points = current?.points ?? [];
  const today = todayISO();
  const ranges = [];
  if (!points.length) ranges.push([from, today]);
  else {
    if (from < points[0][0]) ranges.push([from, addDays(points[0][0], -1)]);
    if ((force || stale(current)) && points.at(-1)[0] < today) ranges.push([addDays(points.at(-1)[0], 1), today]);
  }
  if (!ranges.length) return false;
  for (const [a, b] of ranges) if (a <= b) points = merge(points, await fetchBcra(code, a, b));
  await saveSeries(id, points);
  return true;
}

/** Historial completo de ArgentinaDatos (unos 25 KB): se vuelve a bajar cuando está viejo. */
async function ensureArgentinaDatos(source, force = false) {
  if (!force && !stale(series.get(source))) return false;
  const res = await fetch(`${AD_API}/${AD_CASA[source]}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ArgentinaDatos ${res.status}`);
  const rows = await res.json();
  const points = rows
    .filter((r) => Number(r.venta) > 0)
    .map((r) => [r.fecha, Number(r.venta)])
    .sort((x, y) => x[0].localeCompare(y[0]));
  await saveSeries(source, points);
  return true;
}

/** Fecha del movimiento más antiguo (desde ahí hace falta el historial). */
const firstMovementDate = () => alive('movements').reduce((min, m) => (m.date < min ? m.date : min), todayISO());

/**
 * Se asegura de tener los historiales para convertir con las fuentes pedidas.
 * Devuelve true si descargó algo nuevo. Sin conexión no hace nada.
 */
export async function ensureRates(sources = [activeSource()], { force = false } = {}) {
  if (!navigator.onLine) return false;
  const from = addDays(firstMovementDate(), -10); // margen para fines de semana y feriados
  const jobs = [ensureBcra('EUR', from, force)]; // la relación euro/dólar se usa con todas las fuentes
  for (const s of new Set(sources)) jobs.push(s === 'bcra' ? ensureBcra('USD', from, force) : ensureArgentinaDatos(s, force));
  const results = await Promise.allSettled(jobs);
  results.filter((r) => r.status === 'rejected').forEach((r) => console.warn('Cotizaciones', r.reason));
  return results.some((r) => r.status === 'fulfilled' && r.value);
}

/** Último punto con fecha <= date (o el primero, si la fecha es anterior al historial). */
function pointOn(id, date) {
  const points = series.get(id)?.points;
  if (!points?.length) return null;
  let lo = 0;
  let hi = points.length - 1;
  if (date < points[0][0]) return points[0];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid][0] <= date) lo = mid;
    else hi = mid - 1;
  }
  return points[lo];
}

/**
 * Cotización de una fuente en una fecha: { source, date, USD, EUR } en pesos por
 * unidad. Si todavía no hay historial, usa la última cotización BCRA guardada.
 */
export function rateOn(date, source = activeSource()) {
  const usdPoint = pointOn(source === 'bcra' ? 'bcra-USD' : source, date);
  const eurPoint = pointOn('bcra-EUR', date);
  const fallback = bcraLatest();
  if (!usdPoint) {
    return fallback && source === 'bcra' ? { source, date: fallback.date, USD: fallback.USD, EUR: fallback.EUR } : null;
  }
  const USD = usdPoint[1];
  let EUR;
  if (source === 'bcra' && eurPoint) EUR = eurPoint[1];
  else if (eurPoint?.[2] > 0) EUR = USD * eurPoint[2];
  else if (fallback) EUR = USD * (fallback.EUR / fallback.USD);
  return { source, date: usdPoint[0], USD, EUR };
}

/** Cotización más reciente disponible de una fuente. */
export const latestRate = (source = activeSource()) => rateOn(todayISO(), source);

/** Convierte un monto entre ARS, USD y EUR usando una cotización (pesos por unidad). */
export function convert(amount, from, to, rate) {
  if (from === to) return amount;
  const ars = from === 'ARS' ? amount : amount * rate[from];
  return to === 'ARS' ? ars : ars / rate[to];
}

/**
 * Conversor para los totales en moneda de referencia: cada movimiento se
 * convierte con la cotización de su fecha. Devuelve null si no hay cotizaciones.
 */
export function converter(source = activeSource()) {
  // Si esa fuente todavía no se descargó (por ejemplo, sin conexión), se usa la del BCRA.
  if (!latestRate(source)) source = 'bcra';
  if (!latestRate(source)) return null;
  const cache = new Map();
  const rateFor = (date) => {
    if (!cache.has(date)) cache.set(date, rateOn(date, source));
    return cache.get(date);
  };
  return {
    source,
    at: (m, to) => {
      if (m.currency === to) return m.amount;
      const r = rateFor(m.date);
      return r ? convert(m.amount, m.currency, to, r) : 0;
    },
  };
}
