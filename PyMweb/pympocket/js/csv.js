// Exportación e importación de movimientos en CSV (formato abierto).
// Se exporta con ";" como separador y coma decimal, como lo espera Excel en
// Argentina. Al importar se detecta el separador y el formato de fecha y monto.
import { alive, state } from './store.js';
import { t, tRaw } from './i18n.js';
import { amountForInput, parseAmount, toISO } from './format.js';
import { catName, rootOf, sortByDateDesc } from './model.js';
import { norm, uuid } from './util.js';
import { nextColor } from './defaults.js';

const SEP = ';';

const quote = (v) => {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCSV = (rows) => '﻿' + rows.map((r) => r.map(quote).join(SEP)).join('\r\n');

export function movementsCSV(list = alive('movements')) {
  const header = tRaw('csv.columns');
  const rows = sortByDateDesc([...list]).map((m) => {
    const root = rootOf(m.categoryId);
    const sub = root && root.id !== m.categoryId ? catName(state.categories.find((c) => c.id === m.categoryId)) : '';
    return [
      m.date,
      t(`csv.type.${m.type}`),
      amountForInput(m.amount),
      m.currency,
      root ? catName(root) : '',
      sub,
      m.description ?? '',
      m.paymentMethod ? t(`payment.${m.paymentMethod}`, {}) : '',
    ];
  });
  return toCSV([header, ...rows]);
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = [';', '\t', ','].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === sep) row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const HEADERS = {
  date: ['fecha', 'date', 'dia'],
  type: ['tipo', 'type', 'movimiento'],
  amount: ['monto', 'importe', 'amount', 'valor', 'total'],
  currency: ['moneda', 'currency', 'divisa'],
  category: ['categoria', 'category', 'rubro'],
  subcategory: ['subcategoria', 'subcategory'],
  description: ['descripcion', 'detalle', 'concepto', 'description', 'nota'],
  paymentMethod: ['medio de pago', 'medio', 'forma de pago', 'payment'],
};

function parseDate(s) {
  s = String(s ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return toISO(new Date(+m[1], m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(y, m[2] - 1, +m[1]);
    if (d.getMonth() === m[2] - 1) return toISO(d);
  }
  return null;
}

function parseCurrency(s) {
  const v = norm(s);
  if (!v) return 'ARS';
  if (['usd', 'us$', 'u$s', 'dolar', 'dolares', 'u$d'].includes(v)) return 'USD';
  if (['eur', '€', 'euro', 'euros'].includes(v)) return 'EUR';
  if (['ars', '$', 'peso', 'pesos'].includes(v)) return 'ARS';
  return null;
}

function parsePayment(s) {
  const v = norm(s);
  if (!v) return null;
  return Object.keys(tRaw('payment')).find((k) => norm(t(`payment.${k}`)) === v) ?? null;
}

/**
 * Analiza un CSV y devuelve los movimientos listos para guardar, las
 * categorías que hay que crear y los errores por línea.
 */
export function analyzeImport(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { movements: [], newCategories: [], errors: [{ line: 1, message: t('csv.errors.empty') }] };
  const header = rows[0].map(norm);
  const col = {};
  for (const [field, names] of Object.entries(HEADERS)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i > -1) col[field] = i;
  }
  if (col.date == null || col.amount == null) {
    return { movements: [], newCategories: [], errors: [{ line: 1, message: t('csv.errors.columns') }] };
  }

  const amounts = rows.slice(1).map((r) => parseAmount(r[col.amount]));
  const signedFile = col.type == null && amounts.some((a) => a < 0);
  const categories = state.categories.filter((c) => !c.deletedAt).map((c) => ({ ...c }));
  const newCategories = [];

  const findOrCreate = (name, kind, parentId) => {
    const found = categories.find((c) => c.kind === kind && (c.parentId ?? null) === parentId && norm(catName(c)) === norm(name));
    if (found) return found;
    // Las subcategorías usan el color de su categoría; las categorías nuevas, uno que no esté en uso.
    const color = parentId
      ? categories.find((c) => c.id === parentId)?.color
      : nextColor(categories.filter((c) => c.kind === kind && !c.parentId).map((c) => c.color));
    const created = { id: uuid(), name: name.trim(), icon: parentId ? null : '🏷️', color, kind, parentId, builtin: false, order: 99, archived: false };
    categories.push(created);
    newCategories.push(created);
    return created;
  };

  const movements = [];
  const errors = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const date = parseDate(r[col.date]);
    let amount = amounts[i];
    if (!date) return errors.push({ line, message: t('csv.errors.date', { value: r[col.date] ?? '' }) });
    if (!Number.isFinite(amount) || amount === 0) return errors.push({ line, message: t('csv.errors.amount', { value: r[col.amount] ?? '' }) });

    let type = 'expense';
    if (col.type != null) {
      const v = norm(r[col.type]);
      type = ['ingreso', 'ingresos', 'income', 'entrada'].includes(v) ? 'income' : 'expense';
    } else if (signedFile && amount > 0) type = 'income';
    amount = Math.abs(amount);

    const currency = col.currency != null ? parseCurrency(r[col.currency]) : 'ARS';
    if (!currency) return errors.push({ line, message: t('csv.errors.currency', { value: r[col.currency] }) });

    const catText = col.category != null ? r[col.category]?.trim() : '';
    const fallback = categories.find((c) => c.builtin && c.key === (type === 'expense' ? 'other' : 'other_income'));
    let category = catText ? findOrCreate(catText, type, null) : fallback;
    const subText = col.subcategory != null ? r[col.subcategory]?.trim() : '';
    if (subText && category) category = findOrCreate(subText, type, category.id);

    movements.push({
      type,
      amount,
      currency,
      date,
      categoryId: category?.id ?? null,
      description: col.description != null ? r[col.description]?.trim() ?? '' : '',
      paymentMethod: col.paymentMethod != null ? parsePayment(r[col.paymentMethod]) : null,
    });
  });
  return { movements, newCategories, errors };
}
