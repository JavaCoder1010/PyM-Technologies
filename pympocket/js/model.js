// Consultas y cálculos sobre los datos: categorías, totales, análisis por
// categoría, presupuestos y observaciones automáticas.
import { state, alive, byId } from './store.js';
import { t } from './i18n.js';
import { CURRENCIES, addDays, addMonths, monthRange, todayISO, currentMonth, parseISO, toISO } from './format.js';
import { convert } from './rates.js';
import { sum, norm } from './util.js';

// ---------- Categorías ----------

export const catName = (c) => (c ? c.name || t(`categories.${c.key}`) : t('categories.none'));
export const catIcon = (c) => c?.icon || (c?.parentId ? byId('categories', c.parentId)?.icon : null) || '•';

export const rootOf = (categoryId) => {
  const c = byId('categories', categoryId);
  return c?.parentId ? byId('categories', c.parentId) : c;
};

/** "Servicios › Luz" */
export function catPath(categoryId) {
  const c = byId('categories', categoryId);
  if (!c) return t('categories.none');
  if (!c.parentId) return catName(c);
  return `${catName(byId('categories', c.parentId))} › ${catName(c)}`;
}

const byOrder = (a, b) => (a.order ?? 99) - (b.order ?? 99) || catName(a).localeCompare(catName(b));

export function rootCategories(kind, { includeArchived = false } = {}) {
  return alive('categories')
    .filter((c) => c.kind === kind && !c.parentId && (includeArchived || !c.archived))
    .sort(byOrder);
}

export function childrenOf(parentId, { includeArchived = false } = {}) {
  return alive('categories')
    .filter((c) => c.parentId === parentId && (includeArchived || !c.archived))
    .sort(byOrder);
}

/** Categorías raíz ordenadas por uso reciente (para la carga rápida). */
export function rootsByUsage(kind) {
  const since = addDays(todayISO(), -90);
  const counts = new Map();
  for (const m of alive('movements')) {
    if (m.type !== kind || m.date < since) continue;
    const root = rootOf(m.categoryId)?.id;
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  return rootCategories(kind).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || byOrder(a, b));
}

export const matchesCategory = (m, categoryId) => m.categoryId === categoryId || rootOf(m.categoryId)?.id === categoryId;

// ---------- Movimientos ----------

export const sortByDateDesc = (list) =>
  list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

export function inRange(from, to, type) {
  return alive('movements').filter((m) => m.date >= from && m.date <= to && (!type || m.type === type));
}

export const inMonth = (key, type) => inRange(...monthRange(key), type);

/** Búsqueda con filtros: fecha, categoría, monto, moneda, tipo y texto. */
export function search(f) {
  const text = norm(f.text);
  return sortByDateDesc(
    alive('movements').filter((m) => {
      if (f.from && m.date < f.from) return false;
      if (f.to && m.date > f.to) return false;
      if (f.type && m.type !== f.type) return false;
      if (f.currency && m.currency !== f.currency) return false;
      if (f.categoryId && !matchesCategory(m, f.categoryId)) return false;
      if (f.min != null && m.amount < f.min) return false;
      if (f.max != null && m.amount > f.max) return false;
      if (text && !norm(`${m.description} ${catPath(m.categoryId)} ${m.paymentMethod ?? ''}`).includes(text)) return false;
      return true;
    }),
  );
}

/** Monedas presentes en una lista, en el orden ARS, USD, EUR. */
export const currenciesIn = (list) => CURRENCIES.filter((c) => list.some((m) => m.currency === c));

/** { ARS: { expense, income }, ... } solo para las monedas presentes. */
export function totalsByCurrency(list) {
  const out = {};
  for (const m of list) {
    out[m.currency] ??= { expense: 0, income: 0 };
    out[m.currency][m.type] += m.amount;
  }
  return out;
}

// ---------- Análisis por categoría ----------

/**
 * Gasto por categoría en una moneda. El porcentaje se calcula siempre sobre
 * el total de gastos; si hay ingresos, se agrega el porcentaje sobre ingresos.
 * Si se pasa `rate` y `currency` es la moneda de referencia, se consolidan
 * todas las monedas convirtiéndolas.
 */
export function categoryBreakdown(list, currency, { rate = null } = {}) {
  const value = (m) => (rate ? convert(m.amount, m.currency, currency, rate) : m.amount);
  const relevant = rate ? list : list.filter((m) => m.currency === currency);
  const expenses = relevant.filter((m) => m.type === 'expense');
  const total = sum(expenses, value);
  const income = sum(relevant.filter((m) => m.type === 'income'), value);

  const groups = new Map();
  for (const m of expenses) {
    const root = rootOf(m.categoryId);
    const key = root?.id ?? 'none';
    if (!groups.has(key)) groups.set(key, { category: root, total: 0, count: 0, children: new Map() });
    const g = groups.get(key);
    const v = value(m);
    g.total += v;
    g.count += 1;
    const childKey = m.categoryId !== root?.id ? m.categoryId : null;
    g.children.set(childKey, (g.children.get(childKey) ?? 0) + v);
  }
  const items = [...groups.values()]
    .map((g) => ({
      ...g,
      pct: total ? g.total / total : 0,
      pctIncome: income ? g.total / income : null,
      children: [...g.children.entries()]
        .map(([id, v]) => ({ id, total: v, pct: g.total ? v / g.total : 0 }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
  return { currency, total, income, balance: income - total, items };
}

export function topExpenses(list, currency, n = 5) {
  return list
    .filter((m) => m.type === 'expense' && m.currency === currency)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

/** Total de gastos por mes para un gráfico de evolución. */
export function monthlySeries(currency, endKey, months, type = 'expense') {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const key = addMonths(endKey, -i);
    out.push({ key, value: sum(inMonth(key, type).filter((m) => m.currency === currency), (m) => m.amount) });
  }
  return out;
}

/** Comparación por categoría entre dos meses en una moneda. */
export const compareMonths = (currency, key, prevKey) => compareLists(inMonth(key), inMonth(prevKey), currency);

/** Comparación por categoría entre dos períodos cualesquiera (meses o años). */
export function compareLists(curList, prevList, currency, { rate = null } = {}) {
  const cur = categoryBreakdown(curList, currency, { rate });
  const prev = categoryBreakdown(prevList, currency, { rate });
  const ids = new Set([...cur.items, ...prev.items].map((i) => i.category?.id ?? 'none'));
  const find = (b, id) => b.items.find((i) => (i.category?.id ?? 'none') === id);
  const rows = [...ids].map((id) => {
    const a = find(cur, id);
    const b = find(prev, id);
    const now = a?.total ?? 0;
    const before = b?.total ?? 0;
    return { category: (a ?? b).category, now, before, change: before ? (now - before) / before : null };
  });
  rows.sort((x, y) => y.now - x.now || y.before - x.before);
  return { rows, total: cur.total, prevTotal: prev.total };
}

// ---------- Series para gráficos mensuales y anuales ----------
// `rate` permite expresar todo en la moneda de referencia (consolidado).

const valueIn = (currency, rate) => (m) => (rate ? convert(m.amount, m.currency, currency, rate) : m.currency === currency ? m.amount : 0);

export const yearRange = (year) => [`${year}-01-01`, `${year}-12-31`];
export const inYear = (year, type) => inRange(...yearRange(year), type);

/** Gasto de cada día del mes: [{ day, date, value }] */
export function dailySeries(list, key, currency, { rate = null } = {}) {
  const [from, to] = monthRange(key);
  const days = Number(to.slice(8));
  const out = Array.from({ length: days }, (_, i) => ({ day: i + 1, date: `${key}-${String(i + 1).padStart(2, '0')}`, value: 0 }));
  const v = valueIn(currency, rate);
  for (const m of list) if (m.type === 'expense' && m.date >= from && m.date <= to) out[Number(m.date.slice(8)) - 1].value += v(m);
  return out;
}

/** Suma acumulada; `until` corta la serie (null en los días que no pasaron). */
export function cumulative(values, until = values.length) {
  let acc = 0;
  return values.map((v, i) => (i < until ? (acc += v) : null));
}

/** Gastos e ingresos de cada mes del año: [{ key, expense, income }] */
export function yearMonthly(year, currency, { rate = null } = {}) {
  const out = Array.from({ length: 12 }, (_, i) => ({ key: `${year}-${String(i + 1).padStart(2, '0')}`, expense: 0, income: 0 }));
  const v = valueIn(currency, rate);
  for (const m of inYear(year)) out[Number(m.date.slice(5, 7)) - 1][m.type] += v(m);
  return out;
}

/**
 * Gasto por categoría mes a mes (para columnas apiladas). Se muestran las
 * `top` categorías con más gasto del año y el resto se agrupa en "Otras".
 */
export function categoriesByMonth(year, currency, { rate = null, top = 6 } = {}) {
  const list = inYear(year, 'expense');
  const ranking = categoryBreakdown(list, currency, { rate }).items;
  const main = ranking.slice(0, top).map((i) => i.category?.id ?? 'none');
  const v = valueIn(currency, rate);
  const months = Array.from({ length: 12 }, () => new Map());
  for (const m of list) {
    const value = v(m);
    if (!value) continue;
    const id = rootOf(m.categoryId)?.id ?? 'none';
    const slot = main.includes(id) ? id : 'others';
    const bucket = months[Number(m.date.slice(5, 7)) - 1];
    bucket.set(slot, (bucket.get(slot) ?? 0) + value);
  }
  const keys = ranking.length > top ? [...main, 'others'] : main;
  return {
    categories: keys.map((id) => (id === 'others' || id === 'none' ? { id, category: null } : { id, category: byId('categories', id) })),
    months: months.map((bucket) => keys.map((id) => bucket.get(id) ?? 0)),
  };
}

/** Años con movimientos, del más reciente al más antiguo (siempre incluye el actual). */
export function yearsWithData() {
  const years = new Set([Number(todayISO().slice(0, 4))]);
  for (const m of alive('movements')) years.add(Number(m.date.slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}

// ---------- Consolidado en moneda de referencia ----------

export function consolidated(list, ref, rate) {
  let expense = 0;
  let income = 0;
  for (const m of list) {
    const v = convert(m.amount, m.currency, ref, rate);
    if (m.type === 'expense') expense += v;
    else income += v;
  }
  return { expense, income, balance: income - expense };
}

// ---------- Presupuestos ----------

/**
 * Presupuestos vigentes en un mes. Un presupuesto con `month: null` se repite
 * todos los meses; uno con mes fijo reemplaza al repetido para esa categoría
 * y moneda.
 */
export function effectiveBudgets(key) {
  const chosen = new Map();
  for (const b of alive('budgets')) {
    if (b.month && b.month !== key) continue;
    if (!b.month && b.fromMonth && b.fromMonth > key) continue;
    const slot = `${b.categoryId ?? 'global'}|${b.currency}`;
    const prev = chosen.get(slot);
    if (!prev || (b.month && !prev.month)) chosen.set(slot, b);
  }
  return [...chosen.values()];
}

export function budgetStatus(b, key, extra = null) {
  let list = inMonth(key, 'expense').filter((m) => m.currency === b.currency);
  if (extra) list = list.filter((m) => m.id !== extra.id).concat(extra.deletedAt ? [] : [extra]);
  if (b.categoryId) list = list.filter((m) => matchesCategory(m, b.categoryId));
  const spent = sum(list, (m) => m.amount);
  const pct = b.amount ? spent / b.amount : 0;
  const threshold = state.settings.alertThreshold / 100;
  const level = pct >= 1 ? 'over' : pct >= threshold ? 'warn' : 'ok';
  return { budget: b, spent, pct, level, left: b.amount - spent };
}

export const budgetStatuses = (key) =>
  effectiveBudgets(key)
    .map((b) => budgetStatus(b, key))
    .sort((a, b) => (a.budget.categoryId ? 1 : 0) - (b.budget.categoryId ? 1 : 0) || b.pct - a.pct);

export const budgetLabel = (b) => (b.categoryId ? catName(byId('categories', b.categoryId)) : t('budgets.global'));

// ---------- Observaciones automáticas ----------

/**
 * Compara el gasto por categoría de un período con el anterior y devuelve
 * frases simples ("Gastaste un 30 % más en Salidas que el mes pasado").
 * Para el mes en curso compara contra los mismos días del mes anterior.
 */
export function insights(key = currentMonth(), limit = 4) {
  const isCurrent = key === currentMonth();
  const day = isCurrent ? Number(todayISO().slice(8)) : 31;
  const prevKey = addMonths(key, -1);
  const [from, to] = monthRange(key);
  const [pFrom, pToFull] = monthRange(prevKey);
  const pTo = isCurrent ? toISO(new Date(Math.min(parseISO(`${prevKey}-${String(day).padStart(2, '0')}`), parseISO(pToFull)))) : pToFull;
  const cur = inRange(from, isCurrent ? todayISO() : to);
  const prev = inRange(pFrom, pTo);
  const out = [];

  for (const currency of currenciesIn(cur)) {
    const a = categoryBreakdown(cur, currency);
    const b = categoryBreakdown(prev, currency);
    if (!a.total) continue;
    for (const item of a.items) {
      const before = b.items.find((x) => x.category?.id === item.category?.id)?.total ?? 0;
      if (before <= 0) continue;
      const change = (item.total - before) / before;
      if (Math.abs(change) < 0.2) continue;
      out.push({
        weight: Math.abs(item.total - before),
        text: t(change > 0 ? 'insights.more' : 'insights.less', {
          pct: Math.round(Math.abs(change) * 100),
          category: catName(item.category),
          when: t(isCurrent ? 'insights.soFar' : 'insights.lastMonth'),
        }),
      });
    }
    const top = a.items[0];
    if (top && a.items.length > 1) {
      out.push({ weight: 0, text: t('insights.top', { category: catName(top.category), pct: Math.round(top.pct * 100) }) });
    }
    if (b.total) {
      const change = (a.total - b.total) / b.total;
      if (Math.abs(change) >= 0.1) {
        out.push({
          weight: Math.abs(a.total - b.total) * 2,
          text: t(change > 0 ? 'insights.totalMore' : 'insights.totalLess', { pct: Math.round(Math.abs(change) * 100), currency, when: t(isCurrent ? 'insights.soFar' : 'insights.lastMonth') }),
        });
      }
    }
  }
  return out.sort((x, y) => y.weight - x.weight).slice(0, limit).map((x) => x.text);
}
