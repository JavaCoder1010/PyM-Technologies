// Fragmentos de HTML reutilizados por las vistas.
import { t } from '../i18n.js';
import { h } from '../util.js';
import { byId } from '../store.js';
import { formatDate, money, monthLabel, SYMBOLS } from '../format.js';
import { catIcon, catName, catPath, rootOf } from '../model.js';
import { latestRate } from '../rates.js';

export const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function pageHeader(title, { actions = '', subtitle = '' } = {}) {
  return `<header class="page-header">
    <div><h1 tabindex="-1">${h(title)}</h1>${subtitle ? `<p class="muted">${subtitle}</p>` : ''}</div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </header>`;
}

export function catBadge(categoryId) {
  const root = rootOf(categoryId);
  const c = byId('categories', categoryId);
  return `<span class="cat-dot" style="--cat:${h(root?.color ?? '#64748b')}" aria-hidden="true">${h(catIcon(c))}</span>`;
}

export function movementRow(m) {
  const title = m.description || catName(byId('categories', m.categoryId));
  const meta = [catPath(m.categoryId), m.paymentMethod ? t(`payment.${m.paymentMethod}`) : null, formatDate(m.date)]
    .filter(Boolean)
    .join(' · ');
  const amount = money(m.type === 'expense' ? -m.amount : m.amount, m.currency, { sign: true });
  return `<li>
    <button type="button" class="row" data-action="edit-movement" data-id="${m.id}"
      aria-label="${h(t('movements.rowLabel', { title, amount, type: t(`common.${m.type}`), date: formatDate(m.date) }))}">
      ${catBadge(m.categoryId)}
      <span class="row-main"><span class="row-title">${h(title)}</span><span class="row-meta">${h(meta)}</span></span>
      <span class="row-amount ${m.type}">${h(amount)}</span>
    </button>
  </li>`;
}

export function monthNav(key, { action, min = null, max = null }) {
  const prevDisabled = min && key <= min;
  const nextDisabled = max && key >= max;
  return `<nav class="month-nav" aria-label="${h(t('common.period'))}">
    <button type="button" class="btn-icon" data-action="${action}" data-step="-1" ${prevDisabled ? 'disabled' : ''} aria-label="${h(t('common.prevMonth'))}">${icon('chevron-left')}</button>
    <strong aria-live="polite">${h(monthLabel(key))}</strong>
    <button type="button" class="btn-icon" data-action="${action}" data-step="1" ${nextDisabled ? 'disabled' : ''} aria-label="${h(t('common.nextMonth'))}">${icon('chevron-right')}</button>
  </nav>`;
}

export const empty = (title, text = '', action = '') =>
  `<div class="empty"><p class="empty-title">${h(title)}</p>${text ? `<p class="muted">${h(text)}</p>` : ''}${action}</div>`;

/** Tarjeta que reemplaza a una función Pro en el plan gratuito. */
export function proLock(feature) {
  return `<section class="card pro-lock">
    <span class="pro-badge">${h(t('plan.proBadge'))}</span>
    <h2>${h(t(`plan.features.${feature}.title`))}</h2>
    <p>${h(t(`plan.features.${feature}.text`))}</p>
    <a class="btn btn-primary" href="#/mas#plan">${h(t('plan.seePlans'))}</a>
  </section>`;
}

/** "Banco Nación (billete), último dato del 09/10/2026: US$ 1 = $ 1.535,00 · € 1 = $ 1.718,89." */
export function rateNote(rate = latestRate()) {
  if (!rate) return t('rates.none');
  return t('rates.note', {
    source: t(`rates.sources.${rate.source}`),
    date: formatDate(rate.date),
    usd: money(rate.USD, 'ARS'),
    eur: money(rate.EUR, 'ARS'),
  });
}

/** Nota para los totales convertidos: qué cotización se usó y su último valor. */
export function conversionNote(conv) {
  if (!conv) return t('rates.none');
  return `${t('rates.perDate', { source: t(`rates.short.${conv.source}`) })} ${rateNote(latestRate(conv.source))}`;
}

export const currencyOptions = (selected, { includeNone = false } = {}) =>
  (includeNone ? `<option value="">${h(t('common.none'))}</option>` : '') +
  Object.keys(SYMBOLS)
    .map((c) => `<option value="${c}" ${c === selected ? 'selected' : ''}>${h(t(`currencies.${c}`))}</option>`)
    .join('');
