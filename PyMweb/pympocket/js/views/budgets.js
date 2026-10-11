// Presupuestos mensuales (global y por categoría, por moneda) con alertas.
import { t } from '../i18n.js';
import { h } from '../util.js';
import { state, byId, save, softDelete, setSetting } from '../store.js';
import { CURRENCIES, addMonths, amountForInput, currentMonth, money, monthLabel, parseAmount, percent } from '../format.js';
import { budgetLabel, budgetStatuses, catName, rootCategories } from '../model.js';
import { can } from '../plan.js';
import { closeDialog, confirmDialog, onChange, onClick, onSubmit, openDialog, toast } from '../ui.js';
import { progress } from '../charts.js';
import { catBadge, currencyOptions, empty, icon, monthNav, pageHeader, proLock } from './common.js';

let month = currentMonth();
let rerender = () => {};

export const title = () => t('nav.budgets');

export function render() {
  const header = pageHeader(t('budgets.title'), {
    subtitle: h(t('budgets.subtitle')),
    actions: can('budgets') ? `<button type="button" class="btn btn-primary" data-action="new-budget">${icon('plus')} <span>${h(t('budgets.new'))}</span></button>` : '',
  });
  if (!can('budgets')) return header + proLock('budgets');

  const statuses = budgetStatuses(month);
  const byCurrency = CURRENCIES.map((c) => [c, statuses.filter((s) => s.budget.currency === c)]).filter(([, l]) => l.length);
  const body = byCurrency.length
    ? byCurrency
        .map(
          ([currency, list]) => `<section class="card" aria-labelledby="bud-${currency}">
            <h2 id="bud-${currency}">${h(t(`currencies.${currency}`))}</h2>
            <ul class="budget-list">${list.map(budgetItem).join('')}</ul>
          </section>`,
        )
        .join('')
    : empty(t('budgets.empty'), t('budgets.emptyHint'), `<button type="button" class="btn btn-primary" data-action="new-budget">${icon('plus')} ${h(t('budgets.new'))}</button>`);

  return `${header}
    ${monthNav(month, { action: 'budget-month' })}
    ${body}
    <section class="card">
      <label class="inline-field">${h(t('budgets.threshold'))}
        <select data-change="budget-threshold">
          ${[50, 70, 80, 90].map((n) => `<option value="${n}" ${state.settings.alertThreshold === n ? 'selected' : ''}>${n} %</option>`).join('')}
        </select>
      </label>
      <p class="muted small">${h(t('budgets.thresholdHint'))}</p>
    </section>`;
}

function budgetItem(s) {
  const b = s.budget;
  const label = budgetLabel(b);
  const status =
    s.level === 'over'
      ? t('budgets.overBy', { amount: money(-s.left, b.currency) })
      : t('budgets.leftAmount', { amount: money(s.left, b.currency) });
  return `<li>
    <div class="budget-line">
      <span class="budget-name">${b.categoryId ? catBadge(b.categoryId) : `<span class="cat-dot" aria-hidden="true">Σ</span>`} <strong>${h(label)}</strong>
        <span class="tag">${h(b.month ? t('budgets.onlyThisMonth') : t('budgets.everyMonth'))}</span></span>
      <button type="button" class="btn-icon" data-action="edit-budget" data-id="${b.id}" aria-label="${h(t('budgets.editLabel', { name: label }))}">${icon('edit')}</button>
    </div>
    <div class="budget-line small"><span>${h(money(s.spent, b.currency))} ${h(t('budgets.of'))} ${h(money(b.amount, b.currency))}</span><span>${h(percent(s.pct, 0))}</span></div>
    ${progress(s.pct, { label, level: s.level })}
    <p class="small ${s.level === 'over' ? 'negative' : s.level === 'warn' ? 'warn-text' : 'muted'}">${s.level !== 'ok' ? `${icon('alert')} ` : ''}${h(status)}</p>
  </li>`;
}

function budgetForm(b) {
  const cats = rootCategories('expense');
  return `<form class="sheet" data-form="budget" novalidate>
    <header class="sheet-header"><h2>${h(t(b ? 'budgets.editTitle' : 'budgets.newTitle'))}</h2>
      <button type="button" class="btn-icon" data-action="close-dialog" aria-label="${h(t('common.close'))}">${icon('close')}</button></header>
    <input type="hidden" name="id" value="${b?.id ?? ''}">
    <label>${h(t('budgets.scope'))}
      <select name="categoryId">
        <option value="">${h(t('budgets.global'))} — ${h(t('budgets.globalHint'))}</option>
        ${cats.map((c) => `<option value="${c.id}" ${b?.categoryId === c.id ? 'selected' : ''}>${h(catName(c))}</option>`).join('')}
      </select>
    </label>
    <div class="grid-2">
      <label>${h(t('budgets.amount'))}<input name="amount" inputmode="decimal" required autofocus value="${h(amountForInput(b?.amount))}" placeholder="0,00"></label>
      <label>${h(t('movementForm.currency'))}<select name="currency">${currencyOptions(b?.currency ?? state.settings.lastCurrency)}</select></label>
    </div>
    <label class="check"><input type="checkbox" name="repeat" ${!b || !b.month ? 'checked' : ''}> ${h(t('budgets.repeat'))}</label>
    <p class="muted small">${h(t('budgets.repeatHint', { month: monthLabel(month) }))}</p>
    <p class="form-error" role="alert"></p>
    <div class="sheet-actions">
      ${b ? `<button type="button" class="btn btn-danger-ghost" data-action="delete-budget" data-id="${b.id}">${icon('trash')} ${h(t('common.delete'))}</button>` : ''}
      <button class="btn btn-primary btn-wide">${h(t('common.save'))}</button>
    </div>
  </form>`;
}

export function bind(root, refresh) {
  rerender = refresh;
}

onClick({
  'budget-month': (el) => {
    month = addMonths(month, Number(el.dataset.step));
    rerender();
  },
  'new-budget': () => openDialog(budgetForm(null)),
  'edit-budget': (el) => openDialog(budgetForm(byId('budgets', el.dataset.id))),
  'delete-budget': async (el) => {
    if (!(await confirmDialog(t('budgets.deleteConfirm'), { confirm: t('common.delete'), danger: true }))) return;
    await softDelete('budgets', el.dataset.id);
    toast(t('budgets.deleted'));
  },
});

onChange({ 'budget-threshold': (el) => setSetting('alertThreshold', Number(el.value)) });

onSubmit({
  budget: async (data, form) => {
    const amount = parseAmount(data.get('amount'));
    if (!(amount > 0)) {
      form.querySelector('.form-error').textContent = t('movementForm.errors.amount');
      return;
    }
    const id = data.get('id') || undefined;
    const repeat = data.get('repeat') === 'on';
    await save('budgets', {
      ...(id ? byId('budgets', id) : {}),
      id,
      categoryId: data.get('categoryId') || null,
      currency: data.get('currency'),
      amount,
      month: repeat ? null : month,
      fromMonth: repeat ? (id ? byId('budgets', id).fromMonth ?? null : month) : null,
    });
    closeDialog();
    toast(t('budgets.saved'), { tone: 'success' });
  },
});
