// Recordatorios para registrar gastos y resúmenes periódicos.
// Con la app abierta (o instalada) se muestra una notificación del sistema si
// el usuario dio permiso; además siempre aparece un aviso en Inicio.
// Las notificaciones con la app cerrada requieren el servidor de envío (push).
import { state, alive, setSetting } from './store.js';
import { t } from './i18n.js';
import { addDays, addMonths, currentMonth, monthRange, parseISO, toISO, todayISO } from './format.js';
import { can } from './plan.js';
import { categoryBreakdown, catName, currenciesIn, inRange, insights } from './model.js';

const createdToday = () => {
  const today = todayISO();
  return alive('movements').some((m) => toISO(new Date(m.createdAt)) === today);
};

export function reminderDue(now = new Date()) {
  const r = state.settings.reminder;
  if (!r?.enabled) return false;
  const today = toISO(now);
  if (state.settings.reminderDismissed === today) return false;
  if (r.frequency === 'weekly' && now.getDay() !== Number(r.weekday)) return false;
  const [hh, mm] = r.time.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return false;
  return !createdToday();
}

export async function notifyIfDue() {
  if (!reminderDue()) return false;
  const today = todayISO();
  if (state.settings.reminderNotified === today) return true;
  if ('Notification' in window && Notification.permission === 'granted') {
    const title = 'PymPocket';
    const options = { body: t('reminders.notification'), icon: 'icons/icon-192.png', tag: 'pympocket-reminder' };
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, options);
    else new Notification(title, options);
  }
  await setSetting('reminderNotified', today);
  return true;
}

export async function requestNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

/** Período del último resumen disponible: { key, from, to, label } o null. */
export function pendingSummary() {
  const mode = state.settings.summary;
  if (!can('insights') || mode === 'off') return null;
  let period;
  if (mode === 'monthly') {
    const key = addMonths(currentMonth(), -1);
    const [from, to] = monthRange(key);
    period = { key: `M${key}`, from, to, monthKey: key };
  } else {
    // Semana anterior, de lunes a domingo.
    const today = parseISO(todayISO());
    const monday = addDays(todayISO(), -((today.getDay() + 6) % 7));
    const from = addDays(monday, -7);
    period = { key: `W${from}`, from, to: addDays(monday, -1) };
  }
  if (state.settings.summarySeen === period.key) return null;
  const list = inRange(period.from, period.to);
  if (!list.some((m) => m.type === 'expense')) return null;
  const lines = currenciesIn(list).map((currency) => {
    const b = categoryBreakdown(list, currency);
    return { currency, total: b.total, top: b.items[0] ? catName(b.items[0].category) : null };
  });
  const notes = period.monthKey ? insights(period.monthKey, 3) : [];
  return { ...period, mode, lines, notes };
}
