// Movimientos: listado con búsqueda y filtros por fecha, categoría, monto, moneda y texto.
import { t } from '../i18n.js';
import { h, debounce } from '../util.js';
import { CURRENCIES, formatDate, formatDateLong, money, parseAmount } from '../format.js';
import { catName, childrenOf, rootCategories, search, totalsByCurrency } from '../model.js';
import { minDate, isPro, FREE_HISTORY_MONTHS } from '../plan.js';
import { onChange, onClick, onInput, download } from '../ui.js';
import { movementsCSV } from '../csv.js';
import { empty, icon, movementRow, pageHeader } from './common.js';

const PAGE = 100;
const filters = { text: '', from: '', to: '', type: '', currency: '', categoryId: '', min: '', max: '' };
let limit = PAGE;
let showFilters = false;
let rerender = () => {};

export const title = () => t('nav.movements');

const activeFilterCount = () => Object.entries(filters).filter(([k, v]) => k !== 'text' && v).length;

function query() {
  const floor = minDate();
  const from = filters.from && (!floor || filters.from > floor) ? filters.from : floor ?? filters.from;
  return {
    ...filters,
    from,
    min: filters.min ? parseAmount(filters.min) : null,
    max: filters.max ? parseAmount(filters.max) : null,
  };
}

export function render() {
  const results = search(query());
  return `${pageHeader(t('nav.movements'), {
    actions: `<button type="button" class="btn btn-ghost" data-action="export-filtered">${icon('download')} <span>${h(t('movements.export'))}</span></button>`,
  })}
    <form class="search-bar" role="search" onsubmit="return false">
      <label class="search-input">${icon('search')}<span class="sr-only">${h(t('movements.search'))}</span>
        <input id="mov-search" type="search" placeholder="${h(t('movements.searchHint'))}" value="${h(filters.text)}" data-input="mov-filter" name="text" autocomplete="off">
      </label>
      <button type="button" class="btn btn-ghost" data-action="toggle-filters" aria-expanded="${showFilters}" aria-controls="mov-filters">
        ${icon('filter')} ${h(t('movements.filters'))}${activeFilterCount() ? ` <span class="count">${activeFilterCount()}</span>` : ''}
      </button>
    </form>
    ${showFilters ? filtersPanel() : ''}
    ${!isPro() ? `<p class="muted small">${h(t('movements.freeHistory', { months: FREE_HISTORY_MONTHS }))} <a href="#/mas#plan" class="link">${h(t('plan.seePlans'))}</a></p>` : ''}
    ${resultsHTML(results)}`;
}

function filtersPanel() {
  const catOptions = ['expense', 'income']
    .map(
      (kind) => `<optgroup label="${h(t(`common.${kind}s`))}">${rootCategories(kind)
        .map(
          (c) =>
            `<option value="${c.id}" ${filters.categoryId === c.id ? 'selected' : ''}>${h(catName(c))}</option>` +
            childrenOf(c.id)
              .map((s) => `<option value="${s.id}" ${filters.categoryId === s.id ? 'selected' : ''}>&nbsp;&nbsp;› ${h(catName(s))}</option>`)
              .join(''),
        )
        .join('')}</optgroup>`,
    )
    .join('');
  const floor = minDate() ?? '';
  return `<section class="card filters" id="mov-filters" aria-label="${h(t('movements.filters'))}">
    <div class="grid-3">
      <label>${h(t('movements.from'))}<input type="date" name="from" min="${floor}" value="${filters.from}" data-change="mov-filter"></label>
      <label>${h(t('movements.to'))}<input type="date" name="to" min="${floor}" value="${filters.to}" data-change="mov-filter"></label>
      <label>${h(t('movements.type'))}<select name="type" data-change="mov-filter">
        <option value="">${h(t('common.all'))}</option>
        <option value="expense" ${filters.type === 'expense' ? 'selected' : ''}>${h(t('common.expenses'))}</option>
        <option value="income" ${filters.type === 'income' ? 'selected' : ''}>${h(t('common.incomes'))}</option>
      </select></label>
      <label>${h(t('movements.category'))}<select name="categoryId" data-change="mov-filter"><option value="">${h(t('common.allFem'))}</option>${catOptions}</select></label>
      <label>${h(t('movements.currency'))}<select name="currency" data-change="mov-filter"><option value="">${h(t('common.allFem'))}</option>
        ${CURRENCIES.map((c) => `<option value="${c}" ${filters.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <div class="grid-2 tight">
        <label>${h(t('movements.min'))}<input name="min" inputmode="decimal" value="${h(filters.min)}" data-change="mov-filter" placeholder="0"></label>
        <label>${h(t('movements.max'))}<input name="max" inputmode="decimal" value="${h(filters.max)}" data-change="mov-filter" placeholder="∞"></label>
      </div>
    </div>
    ${activeFilterCount() ? `<button type="button" class="btn btn-ghost btn-small" data-action="clear-filters">${h(t('movements.clear'))}</button>` : ''}
  </section>`;
}

function resultsHTML(results) {
  if (!results.length) {
    return `<div id="mov-results">${empty(t('movements.noResults'), t('movements.noResultsHint'))}</div>`;
  }
  const totals = totalsByCurrency(results);
  const summary = Object.entries(totals)
    .map(([cur, v]) =>
      [v.expense ? `${t('common.expenses')}: ${money(v.expense, cur)}` : '', v.income ? `${t('common.incomes')}: ${money(v.income, cur)}` : '']
        .filter(Boolean)
        .join(' · '),
    )
    .join(' — ');
  const shown = results.slice(0, limit);
  const groups = [];
  for (const m of shown) {
    if (groups.at(-1)?.date !== m.date) groups.push({ date: m.date, items: [] });
    groups.at(-1).items.push(m);
  }
  return `<div id="mov-results">
    <p class="results-summary" aria-live="polite">${h(t('movements.count', { n: results.length }))}. ${h(summary)}</p>
    ${groups
      .map(
        (g) => `<section class="day-group" aria-label="${h(formatDate(g.date))}">
          <h2 class="day-title">${h(formatDateLong(g.date))}</h2>
          <ul class="rows">${g.items.map(movementRow).join('')}</ul>
        </section>`,
      )
      .join('')}
    ${results.length > limit ? `<button type="button" class="btn btn-ghost btn-wide" data-action="more-results">${h(t('movements.showMore'))}</button>` : ''}
  </div>`;
}

export function bind(root, refresh) {
  rerender = refresh;
}

const refreshResults = debounce(() => {
  const box = document.getElementById('mov-results');
  if (box) box.outerHTML = resultsHTML(search(query()));
}, 150);

onInput({
  'mov-filter': (el) => {
    filters[el.name] = el.value;
    limit = PAGE;
    refreshResults();
  },
});
onChange({
  'mov-filter': (el) => {
    filters[el.name] = el.value;
    limit = PAGE;
    rerender();
  },
});
onClick({
  'toggle-filters': () => {
    showFilters = !showFilters;
    rerender();
  },
  'clear-filters': () => {
    Object.keys(filters).forEach((k) => k !== 'text' && (filters[k] = ''));
    rerender();
  },
  'more-results': () => {
    limit += PAGE;
    rerender();
  },
  'export-filtered': () => {
    download(`pympocket-movimientos.csv`, movementsCSV(search(query())), 'text/csv;charset=utf-8');
  },
});
