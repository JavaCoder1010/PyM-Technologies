// Movimientos recurrentes (gastos e ingresos fijos): se registran solos o
// quedan pendientes de confirmación, y se avisa de los próximos vencimientos.
import { alive, byId, save, saveMany } from './store.js';
import { addDays, addMonths, daysInMonth, todayISO } from './format.js';
import { can } from './plan.js';

/** Próxima fecha según la frecuencia, respetando el día del mes elegido. */
export function nextDate(iso, frequency, day) {
  if (frequency === 'weekly') return addDays(iso, 7);
  const step = frequency === 'yearly' ? 12 : 1;
  const key = addMonths(iso.slice(0, 7), step);
  const d = Math.min(day ?? Number(iso.slice(8)), daysInMonth(key));
  return `${key}-${String(d).padStart(2, '0')}`;
}

const movementFrom = (r, date) => ({
  type: r.type,
  amount: r.amount,
  currency: r.currency,
  categoryId: r.categoryId,
  description: r.description,
  paymentMethod: r.paymentMethod,
  date,
  recurringId: r.id,
});

/** Registra los recurrentes automáticos vencidos. Devuelve cuántos movimientos creó. */
export async function processRecurring() {
  if (!can('recurring')) return 0;
  const today = todayISO();
  const created = [];
  const updated = [];
  for (const r of alive('recurring')) {
    if (!r.active || r.mode !== 'auto' || r.nextDate > today) continue;
    let next = r.nextDate;
    for (let i = 0; next <= today && i < 60; i++) {
      created.push(movementFrom(r, next));
      next = nextDate(next, r.frequency, r.day);
    }
    updated.push({ ...r, nextDate: next });
  }
  if (created.length) await saveMany('movements', created);
  if (updated.length) await saveMany('recurring', updated);
  return created.length;
}

export const pendingConfirmations = () =>
  can('recurring') ? alive('recurring').filter((r) => r.active && r.mode === 'confirm' && r.nextDate <= todayISO()) : [];

export function upcoming(days = 7) {
  if (!can('recurring')) return [];
  const today = todayISO();
  const limit = addDays(today, days);
  return alive('recurring')
    .filter((r) => r.active && r.nextDate > today && r.nextDate <= limit)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

/** Confirma (registra) u omite la ocurrencia pendiente de un recurrente. */
export async function resolvePending(id, { skip = false } = {}) {
  const r = byId('recurring', id);
  if (!skip) await save('movements', movementFrom(r, r.nextDate));
  await save('recurring', { ...r, nextDate: nextDate(r.nextDate, r.frequency, r.day) });
}
