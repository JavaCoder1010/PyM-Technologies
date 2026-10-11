// Cotización oficial del BCRA (API pública de estadísticas cambiarias).
// Se actualiza sola al abrir la app y se guarda para usarla sin conexión.
import { state, saveRate } from './store.js';

const API = 'https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones';
const MAX_AGE_MS = 6 * 3600 * 1000;

/** Última cotización guardada: { date, USD, EUR, fetchedAt, source }. Valores en pesos por unidad. */
export function latestRate() {
  return state.rates.reduce((best, r) => (!best || r.date > best.date ? r : best), null);
}

export async function refreshRates({ force = false } = {}) {
  const latest = latestRate();
  if (!force && latest && Date.now() - Date.parse(latest.fetchedAt) < MAX_AGE_MS) return latest;
  if (!navigator.onLine) return latest;

  const res = await fetch(API, { cache: 'no-store' });
  if (!res.ok) throw new Error(`BCRA ${res.status}`);
  const json = await res.json();
  const detail = json?.results?.detalle ?? [];
  const pick = (code) => Number(detail.find((d) => d.codigoMoneda === code)?.tipoCotizacion);
  const rate = { date: json.results.fecha, USD: pick('USD'), EUR: pick('EUR'), fetchedAt: new Date().toISOString(), source: 'BCRA' };
  if (!(rate.USD > 0) || !(rate.EUR > 0)) throw new Error('BCRA: respuesta sin cotización');
  await saveRate(rate);
  return rate;
}

/** Convierte un monto entre ARS, USD y EUR usando una cotización (pesos por unidad). */
export function convert(amount, from, to, rate) {
  if (from === to) return amount;
  const ars = from === 'ARS' ? amount : amount * rate[from];
  return to === 'ARS' ? ars : ars / rate[to];
}
