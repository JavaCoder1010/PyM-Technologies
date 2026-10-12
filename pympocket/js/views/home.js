// Inicio: resumen del mes, avisos y últimos movimientos.
import { t } from '../i18n.js';
import { h } from '../util.js';
import { state, alive, byId, setSetting } from '../store.js';
import { currentMonth, formatDate, formatDateLong, money, monthLabel, percent, todayISO } from '../format.js';
import { budgetLabel, budgetStatuses, categoryBreakdown, catName, consolidated, currenciesIn, inMonth, insights, sortByDateDesc } from '../model.js';
import { converter } from '../rates.js';
import { can } from '../plan.js';
import { pendingConfirmations, resolvePending, upcoming } from '../recurring.js';
import { pendingSummary, reminderDue } from '../habits.js';
import { onClick, toast } from '../ui.js';
import { progress } from '../charts.js';
import { catBadge, conversionNote, empty, icon, movementRow } from './common.js';

export const title = () => t('nav.home');

export function render() {
  const key = currentMonth();
  const month = inMonth(key);
  const recent = sortByDateDesc([...alive('movements')]).slice(0, 6);

  if (!alive('movements').length) {
    return `<h1 tabindex="-1" class="sr-only">${h(t('nav.home'))}</h1>
      ${reminderBanner()}
      <section class="card hero-empty">
        <p class="hero-emoji" aria-hidden="true">👛</p>
        <h2>${h(t('home.welcomeTitle'))}</h2>
        <p>${h(t('home.welcomeText'))}</p>
        <button type="button" class="btn btn-primary btn-large" data-action="new-movement">${icon('plus')} ${h(t('home.firstExpense'))}</button>
        <p class="muted small">${h(t('home.privacyNote'))}</p>
      </section>
      ${pendingCard()}`;
  }

  return `<h1 tabindex="-1" class="sr-only">${h(t('nav.home'))}</h1>
    ${reminderBanner()}
    ${pendingCard()}
    ${summaryCard()}
    <section class="card" aria-labelledby="home-month">
      <div class="card-head">
        <h2 id="home-month">${h(monthLabel(key))}</h2>
        <a href="#/analisis" class="link">${h(t('home.seeAnalysis'))}</a>
      </div>
      ${monthSummary(month)}
    </section>
    ${budgetCard(key)}
    ${insightsCard(key)}
    ${upcomingCard()}
    <section class="card" aria-labelledby="home-recent">
      <div class="card-head">
        <h2 id="home-recent">${h(t('home.recent'))}</h2>
        <a href="#/movimientos" class="link">${h(t('home.seeAll'))}</a>
      </div>
      <ul class="rows">${recent.map(movementRow).join('')}</ul>
    </section>`;
}

function monthSummary(month) {
  const currencies = currenciesIn(month);
  if (!currencies.length) return empty(t('home.noMovementsMonth'));
  const blocks = currencies.map((currency) => {
    const b = categoryBreakdown(month, currency);
    const top = b.items.slice(0, 4);
    return `<div class="currency-block">
      <div class="stats">
        <div class="stat"><span class="stat-label">${h(t('common.expenses'))} (${currency})</span><span class="stat-value">${h(money(b.total, currency))}</span></div>
        ${b.income ? `<div class="stat"><span class="stat-label">${h(t('common.incomes'))}</span><span class="stat-value income">${h(money(b.income, currency))}</span></div>
        <div class="stat"><span class="stat-label">${h(t('common.balance'))}</span><span class="stat-value ${b.balance < 0 ? 'negative' : ''}">${h(money(b.balance, currency))}</span></div>` : ''}
      </div>
      ${top.length ? `<ul class="mini-cats">${top
        .map(
          (i) => `<li>
            ${catBadge(i.category?.id)}
            <span class="mini-name">${h(catName(i.category))}</span>
            <span class="mini-bar" aria-hidden="true"><span style="width:${i.pct * 100}%;background:${h(i.category?.color ?? '#64748b')}"></span></span>
            <span class="mini-pct">${h(percent(i.pct, 0))}</span>
          </li>`,
        )
        .join('')}</ul>` : ''}
    </div>`;
  });
  return blocks.join('') + consolidatedLine(month, currencies);
}

function consolidatedLine(month, currencies) {
  const ref = state.settings.refCurrency;
  const rate = ref ? converter() : null;
  if (!ref || !rate || (currencies.length === 1 && currencies[0] === ref)) return '';
  const c = consolidated(month, ref, rate);
  return `<div class="consolidated">
    <p><strong>${h(t('home.consolidated', { currency: ref }))}:</strong> ${h(money(c.expense, ref))} ${h(t('home.inExpenses'))}</p>
    <p class="muted small">${h(conversionNote(rate))}</p>
  </div>`;
}

function budgetCard(key) {
  if (!can('budgets')) return '';
  const alerts = budgetStatuses(key).filter((s) => s.level !== 'ok');
  if (!alerts.length) return '';
  return `<section class="card card-warn" aria-labelledby="home-budgets">
    <div class="card-head"><h2 id="home-budgets">${h(t('home.budgetAlerts'))}</h2><a class="link" href="#/presupuestos">${h(t('home.seeBudgets'))}</a></div>
    <ul class="budget-list">${alerts
      .map(
        (s) => `<li>
          <div class="budget-line"><span>${h(budgetLabel(s.budget))} (${s.budget.currency})</span><span>${h(percent(s.pct, 0))}</span></div>
          ${progress(s.pct, { label: budgetLabel(s.budget), level: s.level })}
          <p class="small ${s.level === 'over' ? 'negative' : ''}">${h(
            s.level === 'over'
              ? t('budgets.overBy', { amount: money(-s.left, s.budget.currency) })
              : t('budgets.leftAmount', { amount: money(s.left, s.budget.currency) }),
          )}</p>
        </li>`,
      )
      .join('')}</ul>
  </section>`;
}

function insightsCard(key) {
  if (!can('insights')) return '';
  const list = insights(key, 3);
  if (!list.length) return '';
  return `<section class="card" aria-labelledby="home-insights">
    <h2 id="home-insights">${h(t('home.insights'))}</h2>
    <ul class="insights">${list.map((s) => `<li>${h(s)}</li>`).join('')}</ul>
  </section>`;
}

function upcomingCard() {
  const list = upcoming(7);
  if (!list.length) return '';
  return `<section class="card" aria-labelledby="home-upcoming">
    <div class="card-head"><h2 id="home-upcoming">${h(t('home.upcoming'))}</h2><a class="link" href="#/recurrentes">${h(t('home.manage'))}</a></div>
    <ul class="rows">${list
      .map(
        (r) => `<li><div class="row row-static">${catBadge(r.categoryId)}
          <span class="row-main"><span class="row-title">${h(r.description || catName(byId('categories', r.categoryId)))}</span>
          <span class="row-meta">${h(formatDateLong(r.nextDate))} · ${h(t(`recurring.mode.${r.mode}`))}</span></span>
          <span class="row-amount ${r.type}">${h(money(r.amount, r.currency))}</span></div></li>`,
      )
      .join('')}</ul>
  </section>`;
}

function pendingCard() {
  const list = pendingConfirmations();
  if (!list.length) return '';
  return `<section class="card card-accent" aria-labelledby="home-pending">
    <h2 id="home-pending">${h(t('home.pending'))}</h2>
    <ul class="rows">${list
      .map(
        (r) => `<li><div class="row row-static">${catBadge(r.categoryId)}
          <span class="row-main"><span class="row-title">${h(r.description || catName(byId('categories', r.categoryId)))}</span>
          <span class="row-meta">${h(t('home.dueOn', { date: formatDate(r.nextDate) }))} · ${h(money(r.amount, r.currency))}</span></span>
          <span class="row-buttons">
            <button type="button" class="btn btn-small btn-primary" data-action="confirm-recurring" data-id="${r.id}">${h(t('home.register'))}</button>
            <button type="button" class="btn btn-small btn-ghost" data-action="skip-recurring" data-id="${r.id}">${h(t('home.skip'))}</button>
          </span></div></li>`,
      )
      .join('')}</ul>
  </section>`;
}

function reminderBanner() {
  if (!reminderDue()) return '';
  return `<div class="banner" role="status">
    ${icon('bell')}<p>${h(t('reminders.banner'))}</p>
    <button type="button" class="btn btn-small btn-primary" data-action="new-movement">${h(t('reminders.add'))}</button>
    <button type="button" class="btn-icon" data-action="dismiss-reminder" aria-label="${h(t('common.close'))}">${icon('close')}</button>
  </div>`;
}

function summaryCard() {
  const s = pendingSummary();
  if (!s) return '';
  const heading = s.mode === 'monthly' ? t('summary.monthTitle', { month: monthLabel(s.monthKey) }) : t('summary.weekTitle', { from: formatDate(s.from), to: formatDate(s.to) });
  return `<section class="card card-accent" aria-labelledby="home-summary">
    <div class="card-head"><h2 id="home-summary">${h(heading)}</h2>
      <button type="button" class="btn-icon" data-action="dismiss-summary" data-key="${h(s.key)}" aria-label="${h(t('common.close'))}">${icon('close')}</button></div>
    <ul class="insights">
      ${s.lines
        .filter((l) => l.total > 0)
        .map((l) => `<li>${h(t('summary.spent', { amount: money(l.total, l.currency) }))}${l.top ? ` ${h(t('summary.topCategory', { category: l.top }))}` : ''}</li>`)
        .join('')}
      ${s.notes.map((n) => `<li>${h(n)}</li>`).join('')}
    </ul>
  </section>`;
}

onClick({
  'confirm-recurring': async (el) => {
    await resolvePending(el.dataset.id);
    toast(t('home.registered'), { tone: 'success' });
  },
  'skip-recurring': (el) => resolvePending(el.dataset.id, { skip: true }),
  'dismiss-reminder': () => setSetting('reminderDismissed', todayISO()),
  'dismiss-summary': (el) => setSetting('summarySeen', el.dataset.key),
});
