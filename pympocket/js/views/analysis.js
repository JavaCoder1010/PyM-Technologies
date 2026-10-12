// Análisis y reportes, en vista mensual o anual: gasto por categoría con
// porcentajes, gasto por día, ritmo del mes, evolución, mes a mes,
// comparaciones y gastos más altos.
import { t } from '../i18n.js';
import { h, sum } from '../util.js';
import { state, byId, setSetting } from '../store.js';
import { CURRENCIES, addMonths, currentMonth, formatDate, formatDayMonth, money, moneyShort, monthLabel, percent, todayISO } from '../format.js';
import {
  catName,
  categoriesByMonth,
  categoryBreakdown,
  compareLists,
  cumulative,
  currenciesIn,
  dailySeries,
  inMonth,
  inRange,
  inYear,
  insights,
  monthlySeries,
  topExpenses,
  yearMonthly,
  yearsWithData,
} from '../model.js';
import { SOURCES, activeSource, converter, ensureRates, latestRate, sourceAllowed } from '../rates.js';
import { can, isPro, minMonth, FREE_HISTORY_MONTHS } from '../plan.js';
import { onClick, toast } from '../ui.js';
import { bars, columns, donut, legend, lines } from '../charts.js';
import { catBadge, conversionNote, empty, icon, monthNav, pageHeader, proLock } from './common.js';

const thisYear = () => Number(todayISO().slice(0, 4));

let mode = 'month'; // 'month' | 'year'
let month = currentMonth();
let year = thisYear();
let viewCurrency = null; // moneda que se está mirando (o a la que se convierte)
let evolutionMonths = 6;
let rerender = () => {};

const EXPENSE_COLOR = 'var(--accent)';
const INCOME_COLOR = 'var(--income)';
const PREV_COLOR = 'var(--muted)';
const OTHERS_COLOR = '#94a3b8';

export const title = () => t('nav.analysis');

export function render() {
  const header = pageHeader(t('analysis.title'), {
    actions: `<button type="button" class="btn btn-ghost" data-action="print-report">${icon('download')} <span>${h(t('analysis.pdf'))}</span></button>`,
  });
  const switcher = `<div class="mode-switch"><div class="segmented" role="group" aria-label="${h(t('analysis.view'))}">
    ${['month', 'year']
      .map((m) => `<button type="button" data-action="analysis-mode" data-mode="${m}" aria-pressed="${mode === m}">${h(t(`analysis.mode.${m}`))}${m === 'year' && !can('annual') ? ` <span class="pro-badge">${h(t('plan.proBadge'))}</span>` : ''}</button>`)
      .join('')}
  </div></div>`;
  return header + switcher + (mode === 'year' ? renderYear() : renderMonth());
}

/**
 * Botones de moneda y de cotización. "Sin convertir" muestra solo los
 * movimientos de esa moneda; con una cotización se convierte todo a esa
 * moneda (cada movimiento con la cotización de su fecha). La elección se guarda
 * como moneda de referencia, así Inicio muestra el mismo total convertido.
 */
function currencyControls(list) {
  const ref = state.settings.refCurrency;
  const quote = ref ? activeSource() : null;
  if (quote) viewCurrency = ref;
  else if (!CURRENCIES.includes(viewCurrency)) viewCurrency = currenciesIn(list)[0] ?? 'ARS';

  const currencyButtons = CURRENCIES.map(
    (c) => `<button type="button" data-action="analysis-currency" data-currency="${c}" aria-pressed="${c === viewCurrency}">${h(t(`currencies.${c}`))}</button>`,
  ).join('');
  const quoteButtons = [null, ...SOURCES].map((src) => {
    const locked = src && !sourceAllowed(src);
    const label = src ? t(`rates.short.${src}`) : t('analysis.noConversion');
    return `<button type="button" data-action="analysis-quote" data-quote="${src ?? ''}" aria-pressed="${src === quote}" ${src ? `title="${h(t(`rates.sources.${src}`))}"` : ''}>
      ${h(label)}${locked ? ` <span class="pro-badge">${h(t('plan.proBadge'))}</span>` : ''}</button>`;
  }).join('');

  const html = `<div class="analysis-controls">
    <div class="control-row" role="group" aria-labelledby="ctl-currency">
      <span class="control-label" id="ctl-currency">${h(t('analysis.currency'))}</span>
      <div class="segmented segmented-wrap">${currencyButtons}</div>
    </div>
    <div class="control-row" role="group" aria-labelledby="ctl-quote">
      <span class="control-label" id="ctl-quote">${h(t('analysis.convertWith'))}</span>
      <div class="segmented segmented-wrap">${quoteButtons}</div>
    </div>
  </div>`;

  // Si esa cotización todavía no se descargó, se pide y se avisa mientras tanto.
  const loading = quote && !latestRate(quote);
  if (loading && navigator.onLine) ensureRates([quote]).then(() => rerender());
  const rate = quote && !loading ? converter(quote) : null;
  return { html, currency: viewCurrency, rate, isRef: Boolean(quote), loading, quote };
}

/** Aviso cuando se eligió convertir pero todavía no hay cotización. */
const ratePending = (ctl) =>
  `<section class="card">${h(ctl.loading && navigator.onLine ? t('rates.downloading', { source: t(`rates.sources.${ctl.quote}`) }) : t('rates.none'))}</section>`;

const noData = (text) =>
  empty(text, t('analysis.emptyHint'), `<button type="button" class="btn btn-primary" data-action="new-movement">${icon('plus')} ${h(t('home.firstExpense'))}</button>`);

// ====================== Vista mensual ======================

function renderMonth() {
  const floor = minMonth();
  if (floor && month < floor) month = floor;
  const list = inMonth(month);
  const nav = monthNav(month, { action: 'analysis-month', min: floor, max: currentMonth() });
  const freeNote = !isPro() ? `<p class="muted small center">${h(t('analysis.freeHistory', { months: FREE_HISTORY_MONTHS }))}</p>` : '';
  if (!list.length) return `${nav}${freeNote}${noData(t('analysis.empty'))}`;
  const tabs = currencyControls(list);
  if (tabs.isRef && !tabs.rate) return `${nav}${tabs.html}${ratePending(tabs)}`;

  const { currency, rate, isRef } = tabs;
  const b = categoryBreakdown(list, currency, { rate });
  return `${nav}${freeNote}${tabs.html}
    <div role="tabpanel">
    ${isRef ? `<p class="note">${icon('info')} ${h(t('analysis.consolidatedNote'))} ${h(conversionNote(rate))}</p>` : ''}
    ${summaryCard(b, currency)}
    ${b.total ? breakdownCard(b, currency, monthLabel(month)) : empty(t('analysis.noExpenses'))}
    ${b.total ? dailyCard(list, currency, rate) : ''}
    ${can('comparisons') ? paceCard(currency, rate) : ''}
    ${!isRef ? evolutionCard(currency) : ''}
    ${can('comparisons')
      ? comparisonCard(compareLists(list, inMonth(addMonths(month, -1)), currency, { rate }), currency, {
          heading: t('analysis.comparison', { month: monthLabel(addMonths(month, -1)) }),
          prev: monthLabel(addMonths(month, -1), { short: true }),
          cur: monthLabel(month, { short: true }),
        })
      : proLock('comparisons')}
    ${!isRef && b.total ? topCard(list, currency) : ''}
    ${can('insights') ? insightsCard() : ''}
    </div>`;
}

function summaryCard(b, currency, extra = '') {
  return `<section class="card" aria-labelledby="an-summary">
    <h2 id="an-summary" class="sr-only">${h(t('analysis.summary'))}</h2>
    <div class="stats">
      <div class="stat"><span class="stat-label">${h(t('analysis.totalExpenses'))}</span><span class="stat-value">${h(money(b.total, currency))}</span></div>
      ${b.income ? `<div class="stat"><span class="stat-label">${h(t('common.incomes'))}</span><span class="stat-value income">${h(money(b.income, currency))}</span></div>
        <div class="stat"><span class="stat-label">${h(t('common.balance'))}</span><span class="stat-value ${b.balance < 0 ? 'negative' : ''}">${h(money(b.balance, currency))}</span></div>` : ''}
      ${extra}
    </div>
    ${b.income ? `<p class="muted small">${h(t('analysis.incomeNote'))}</p>` : ''}
  </section>`;
}

function breakdownCard(b, currency, periodLabel) {
  const chart = donut(
    b.items.map((i) => ({ value: i.total, color: i.category?.color ?? '#64748b', label: `${catName(i.category)}: ${percent(i.pct)}` })),
    { title: t('analysis.chartTitle', { month: periodLabel }), center: moneyShort(b.total, currency), centerSub: t('common.expenses').toLowerCase() },
  );
  return `<section class="card" aria-labelledby="an-cats">
    <h2 id="an-cats">${h(t('analysis.byCategory'))}</h2>
    <div class="breakdown">
      <div class="breakdown-chart">${chart}</div>
      <ul class="cat-list">${b.items
        .map((i) => {
          const subs = i.children.filter((c) => c.id);
          const line = `${catBadge(i.category?.id)}
            <span class="cat-name">${h(catName(i.category))}</span>
            <span class="cat-amount">${h(money(i.total, currency))}</span>
            <span class="cat-pct">${h(percent(i.pct))}</span>
            <span class="cat-bar" aria-hidden="true"><span style="width:${i.pct * 100}%;background:${h(i.category?.color ?? '#64748b')}"></span></span>
            ${i.pctIncome != null ? `<span class="cat-income small muted">${h(t('analysis.ofIncome', { pct: percent(i.pctIncome) }))}</span>` : ''}`;
          if (!subs.length) return `<li><div class="cat-item">${line}</div></li>`;
          return `<li><details><summary class="cat-item">${line}</summary>
            <ul class="sub-list">${i.children
              .map(
                (c) => `<li><span>${h(c.id ? catName(byId('categories', c.id)) : t('analysis.noSubcategory'))}</span>
                  <span>${h(money(c.total, currency))}</span><span class="muted">${h(percent(c.pct))}</span></li>`,
              )
              .join('')}</ul></details></li>`;
        })
        .join('')}</ul>
    </div>
  </section>`;
}

/** Gasto de cada día del mes, con el promedio diario. */
function dailyCard(list, currency, rate) {
  const days = dailySeries(list, month, currency, { rate });
  const today = todayISO();
  const elapsed = month === currentMonth() ? Number(today.slice(8)) : days.length;
  const total = sum(days, (d) => d.value);
  const peak = days.reduce((a, d) => (d.value > a.value ? d : a), days[0]);
  const groups = days.map((d) => ({
    label: String(d.day),
    highlight: d.date === today,
    series: [{ value: d.value, color: EXPENSE_COLOR, label: t('common.expenses') }],
  }));
  return `<section class="card" aria-labelledby="an-daily">
    <h2 id="an-daily">${h(t('analysis.daily'))}</h2>
    <div class="stats stats-small">
      <div class="stat"><span class="stat-label">${h(t('analysis.dailyAverage'))}</span><span class="stat-value">${h(money(total / elapsed, currency))}</span></div>
      <div class="stat"><span class="stat-label">${h(t('analysis.peakDay'))}</span><span class="stat-value">${h(formatDayMonth(peak.date))} · ${h(money(peak.value, currency))}</span></div>
    </div>
    ${columns(groups, { title: t('analysis.dailyTitle', { month: monthLabel(month) }), format: (v) => moneyShort(v, currency), labelEvery: 5 })}
    ${srTable(t('analysis.dailyTitle', { month: monthLabel(month) }), days.filter((d) => d.value).map((d) => [formatDate(d.date), money(d.value, currency)]))}
  </section>`;
}

/** Gasto acumulado del mes contra el mes anterior: muestra si vas más rápido o más lento. */
function paceCard(currency, rate) {
  const prevKey = addMonths(month, -1);
  const cur = dailySeries(inMonth(month), month, currency, { rate }).map((d) => d.value);
  const prev = dailySeries(inMonth(prevKey), prevKey, currency, { rate }).map((d) => d.value);
  if (!sum(prev)) return '';
  const elapsed = month === currentMonth() ? Number(todayISO().slice(8)) : cur.length;
  const curAcc = cumulative(cur, elapsed);
  const prevAcc = cumulative(prev);
  const length = Math.max(cur.length, prev.length);
  const nowValue = curAcc[elapsed - 1] ?? 0;
  const thenValue = prevAcc[Math.min(elapsed, prev.length) - 1] ?? 0;
  const diff = thenValue ? (nowValue - thenValue) / thenValue : null;
  const message =
    diff == null || Math.abs(diff) < 0.03
      ? t('analysis.paceSame')
      : t(diff > 0 ? 'analysis.paceMore' : 'analysis.paceLess', { pct: Math.round(Math.abs(diff) * 100) });
  const curName = monthLabel(month, { short: true });
  const prevName = monthLabel(prevKey, { short: true });
  return `<section class="card" aria-labelledby="an-pace">
    <h2 id="an-pace">${h(t('analysis.pace'))}</h2>
    <p class="${diff > 0.03 ? 'warn-text' : diff < -0.03 ? 'income' : ''}">${h(message)}</p>
    ${lines(
      [
        { label: prevName, color: PREV_COLOR, values: prevAcc, dashed: true },
        { label: curName, color: EXPENSE_COLOR, values: curAcc },
      ],
      { xLabels: Array.from({ length }, (_, i) => String(i + 1)), title: t('analysis.paceTitle'), format: (v) => moneyShort(v, currency) },
    )}
    ${legend([
      { label: curName, color: EXPENSE_COLOR },
      { label: prevName, color: PREV_COLOR, dashed: true },
    ])}
  </section>`;
}

function evolutionCard(currency) {
  const months = isPro() ? evolutionMonths : FREE_HISTORY_MONTHS;
  const series = monthlySeries(currency, month, months);
  const data = series.map((s) => ({ label: monthLabel(s.key, { short: true }), value: s.value, highlight: s.key === month }));
  return `<section class="card" aria-labelledby="an-evo">
    <div class="card-head"><h2 id="an-evo">${h(t('analysis.evolution'))}</h2>
      ${isPro() ? `<div class="segmented segmented-small" role="group" aria-label="${h(t('analysis.range'))}">
        ${[6, 12].map((n) => `<button type="button" data-action="evo-range" data-n="${n}" aria-pressed="${n === evolutionMonths}">${h(t('analysis.months', { n }))}</button>`).join('')}
      </div>` : ''}
    </div>
    ${bars(data, { title: t('analysis.evolutionTitle', { currency }), format: (v) => moneyShort(v, currency) })}
    ${srTable(t('analysis.evolutionTitle', { currency }), series.map((s) => [monthLabel(s.key), money(s.value, currency)]))}
  </section>`;
}

function comparisonCard(c, currency, { heading, prev, cur }) {
  if (!c.rows.length) return '';
  const change = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${percent(v, 0)}`);
  const total = c.prevTotal ? (c.total - c.prevTotal) / c.prevTotal : null;
  return `<section class="card" aria-labelledby="an-cmp">
    <h2 id="an-cmp">${h(heading)}</h2>
    <div class="table-wrap"><table class="table">
      <thead><tr><th scope="col">${h(t('analysis.category'))}</th><th scope="col" class="num">${h(prev)}</th>
        <th scope="col" class="num">${h(cur)}</th><th scope="col" class="num">${h(t('analysis.change'))}</th></tr></thead>
      <tbody>${c.rows
        .map(
          (r) => `<tr><th scope="row">${h(catName(r.category))}</th><td class="num">${h(money(r.before, currency))}</td>
            <td class="num">${h(money(r.now, currency))}</td><td class="num ${r.change > 0 ? 'negative' : r.change < 0 ? 'income' : ''}">${h(change(r.change))}</td></tr>`,
        )
        .join('')}</tbody>
      <tfoot><tr><th scope="row">${h(t('common.total'))}</th><td class="num">${h(money(c.prevTotal, currency))}</td>
        <td class="num">${h(money(c.total, currency))}</td><td class="num">${h(change(total))}</td></tr></tfoot>
    </table></div>
  </section>`;
}

function topCard(list, currency, n = 5) {
  const top = topExpenses(list, currency, n);
  return `<section class="card" aria-labelledby="an-top">
    <h2 id="an-top">${h(t('analysis.top'))}</h2>
    <ol class="top-list">${top
      .map(
        (m) => `<li><button type="button" class="row" data-action="edit-movement" data-id="${m.id}">
          ${catBadge(m.categoryId)}
          <span class="row-main"><span class="row-title">${h(m.description || catName(byId('categories', m.categoryId)))}</span>
          <span class="row-meta">${h(formatDate(m.date))}</span></span>
          <span class="row-amount">${h(money(m.amount, currency))}</span></button></li>`,
      )
      .join('')}</ol>
  </section>`;
}

function insightsCard() {
  const list = insights(month);
  if (!list.length) return '';
  return `<section class="card" aria-labelledby="an-ins"><h2 id="an-ins">${h(t('home.insights'))}</h2>
    <ul class="insights">${list.map((s) => `<li>${h(s)}</li>`).join('')}</ul></section>`;
}

/** Tabla oculta con los datos del gráfico, para lectores de pantalla. */
const srTable = (caption, rows) =>
  `<div class="sr-only"><table><caption>${h(caption)}</caption><tbody>${rows
    .map(([a, ...rest]) => `<tr><th scope="row">${h(a)}</th>${rest.map((v) => `<td>${h(v)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;

// ====================== Vista anual ======================

function renderYear() {
  if (!can('annual')) return proLock('annual');
  const years = yearsWithData();
  const oldest = years.at(-1);
  if (year > thisYear()) year = thisYear();
  const nav = `<nav class="month-nav" aria-label="${h(t('analysis.year'))}">
    <button type="button" class="btn-icon" data-action="analysis-year" data-step="-1" ${year <= oldest ? 'disabled' : ''} aria-label="${h(t('analysis.prevYear'))}">${icon('chevron-left')}</button>
    <strong aria-live="polite">${year}</strong>
    <button type="button" class="btn-icon" data-action="analysis-year" data-step="1" ${year >= thisYear() ? 'disabled' : ''} aria-label="${h(t('analysis.nextYear'))}">${icon('chevron-right')}</button>
  </nav>`;
  const list = inYear(year);
  if (!list.length) return `${nav}${noData(t('analysis.emptyYear'))}`;
  const tabs = currencyControls(list);
  if (tabs.isRef && !tabs.rate) return `${nav}${tabs.html}${ratePending(tabs)}`;

  const { currency, rate, isRef } = tabs;
  const b = categoryBreakdown(list, currency, { rate });
  const monthly = yearMonthly(year, currency, { rate });
  // El promedio cuenta desde el primer mes con datos (por si empezaste a cargar a mitad de año).
  const isCurrent = year === thisYear();
  const firstMonth = Math.max(monthly.findIndex((m) => m.expense || m.income), 0);
  const lastMonth = isCurrent ? Number(currentMonth().slice(5)) - 1 : 11;
  const monthsCounted = Math.max(lastMonth - firstMonth + 1, 1);
  const peak = monthly.reduce((a, m) => (m.expense > a.expense ? m : a), monthly[0]);
  const extra = `<div class="stat"><span class="stat-label">${h(t('analysis.monthlyAverage'))}</span><span class="stat-value">${h(money(b.total / monthsCounted, currency))}</span></div>
    ${peak.expense ? `<div class="stat"><span class="stat-label">${h(t('analysis.peakMonth'))}</span><span class="stat-value">${h(monthLabel(peak.key, { short: true }))} · ${h(moneyShort(peak.expense, currency))}</span></div>` : ''}`;
  // En el año en curso se compara contra el mismo período del año anterior.
  const today = todayISO();
  const prevList = isCurrent ? inRange(`${year - 1}-01-01`, `${year - 1}${today.slice(4)}`) : inYear(year - 1);
  const cmpHeading = isCurrent
    ? t('analysis.comparisonYearToDate', { year: year - 1, date: formatDayMonth(today) })
    : t('analysis.comparisonYear', { year: year - 1 });

  return `${nav}${tabs.html}
    <div role="tabpanel">
    ${isRef ? `<p class="note">${icon('info')} ${h(t('analysis.consolidatedNote'))} ${h(conversionNote(rate))}</p>` : ''}
    ${summaryCard(b, currency, extra)}
    ${monthByMonthCard(monthly, currency)}
    ${b.total ? categoriesByMonthCard(currency, rate) : ''}
    ${b.total ? breakdownCard(b, currency, String(year)) : empty(t('analysis.noExpenses'))}
    ${prevList.length
      ? comparisonCard(compareLists(list, prevList, currency, { rate }), currency, { heading: cmpHeading, prev: String(year - 1), cur: String(year) })
      : ''}
    ${!isRef && b.total ? topCard(list, currency, 10) : ''}
    </div>`;
}

/** Gastos (e ingresos, si hay) de cada mes del año. */
function monthByMonthCard(monthly, currency) {
  const hasIncome = monthly.some((m) => m.income);
  const current = currentMonth();
  const groups = monthly.map((m) => ({
    label: monthLabel(m.key, { short: true }),
    short: monthLabel(m.key, { short: true }).charAt(0),
    highlight: m.key === current,
    series: [
      { value: m.expense, color: EXPENSE_COLOR, label: t('common.expenses') },
      ...(hasIncome ? [{ value: m.income, color: INCOME_COLOR, label: t('common.incomes') }] : []),
    ],
  }));
  const heading = hasIncome ? t('analysis.monthByMonthBoth') : t('analysis.monthByMonth');
  return `<section class="card" aria-labelledby="an-mbm">
    <h2 id="an-mbm">${h(heading)}</h2>
    ${columns(groups, { title: `${heading} ${year}`, format: (v) => moneyShort(v, currency) })}
    ${hasIncome ? legend([{ label: t('common.expenses'), color: EXPENSE_COLOR }, { label: t('common.incomes'), color: INCOME_COLOR }]) : ''}
    ${srTable(`${heading} ${year}`, monthly.map((m) => [monthLabel(m.key), money(m.expense, currency), ...(hasIncome ? [money(m.income, currency)] : [])]))}
  </section>`;
}

/** Columnas apiladas: cuánto pesó cada categoría en cada mes. */
function categoriesByMonthCard(currency, rate) {
  const data = categoriesByMonth(year, currency, { rate });
  const color = (c) => (c.id === 'others' ? OTHERS_COLOR : c.category?.color ?? '#64748b');
  const name = (c) => (c.id === 'others' ? t('analysis.otherCategories') : catName(c.category));
  const groups = data.months.map((values, i) => ({
    label: monthLabel(`${year}-${String(i + 1).padStart(2, '0')}`, { short: true }),
    short: monthLabel(`${year}-${String(i + 1).padStart(2, '0')}`, { short: true }).charAt(0),
    series: data.categories.map((c, j) => ({ value: values[j], color: color(c), label: name(c) })),
  }));
  return `<section class="card" aria-labelledby="an-cbm">
    <h2 id="an-cbm">${h(t('analysis.categoriesByMonth'))}</h2>
    ${columns(groups, { stacked: true, title: t('analysis.categoriesByMonthTitle', { year }), format: (v) => moneyShort(v, currency) })}
    ${legend(data.categories.map((c) => ({ label: name(c), color: color(c) })))}
    ${srTable(
      t('analysis.categoriesByMonthTitle', { year }),
      groups.filter((g) => g.series.some((s) => s.value)).map((g) => [g.label, ...g.series.filter((s) => s.value).map((s) => `${s.label}: ${money(s.value, currency)}`)]),
    )}
  </section>`;
}

export function bind(root, refresh) {
  rerender = refresh;
}

onClick({
  'analysis-mode': (el) => {
    mode = el.dataset.mode;
    rerender();
  },
  'analysis-month': (el) => {
    month = addMonths(month, Number(el.dataset.step));
    rerender();
  },
  'analysis-year': (el) => {
    year += Number(el.dataset.step);
    rerender();
  },
  'analysis-currency': async (el) => {
    viewCurrency = el.dataset.currency;
    // Si se está convirtiendo, la moneda elegida pasa a ser la de referencia.
    if (state.settings.refCurrency) await setSetting('refCurrency', viewCurrency);
    rerender();
  },
  'analysis-quote': async (el) => {
    const quote = el.dataset.quote || null;
    if (quote && !sourceAllowed(quote)) {
      toast(t('plan.proOnly'), { action: t('plan.seePlans'), onAction: () => (location.hash = '#/mas#plan') });
      return;
    }
    if (quote) {
      await setSetting('rateSource', quote);
      await setSetting('refCurrency', viewCurrency ?? 'ARS');
    } else {
      await setSetting('refCurrency', null);
    }
    rerender();
  },
  'evo-range': (el) => {
    evolutionMonths = Number(el.dataset.n);
    rerender();
  },
  'print-report': () => {
    if (!can('pdf')) {
      toast(t('plan.proOnly'), { action: t('plan.seePlans'), onAction: () => (location.hash = '#/mas#plan') });
      return;
    }
    document.body.classList.add('printing');
    window.print();
    document.body.classList.remove('printing');
  },
});
