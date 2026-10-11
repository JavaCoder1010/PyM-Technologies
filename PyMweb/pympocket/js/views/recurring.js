// Gastos e ingresos fijos (alquiler, suscripciones, servicios, sueldo).
import { t } from '../i18n.js';
import { h } from '../util.js';
import { state, alive, byId, save, softDelete } from '../store.js';
import { amountForInput, formatDate, money, parseAmount, todayISO } from '../format.js';
import { catName, childrenOf, rootCategories } from '../model.js';
import { can } from '../plan.js';
import { processRecurring } from '../recurring.js';
import { closeDialog, confirmDialog, onChange, onClick, onSubmit, openDialog, toast } from '../ui.js';
import { PAYMENT_METHODS } from '../defaults.js';
import { catBadge, currencyOptions, empty, icon, pageHeader, proLock } from './common.js';

export const title = () => t('nav.recurring');

export function render() {
  const header = pageHeader(t('recurring.title'), {
    subtitle: h(t('recurring.subtitle')),
    actions: can('recurring') ? `<button type="button" class="btn btn-primary" data-action="new-recurring">${icon('plus')} <span>${h(t('recurring.new'))}</span></button>` : '',
  });
  if (!can('recurring')) return header + proLock('recurring');
  const list = alive('recurring').sort((a, b) => Number(b.active) - Number(a.active) || a.nextDate.localeCompare(b.nextDate));
  if (!list.length) {
    return header + empty(t('recurring.empty'), t('recurring.emptyHint'), `<button type="button" class="btn btn-primary" data-action="new-recurring">${icon('plus')} ${h(t('recurring.new'))}</button>`);
  }
  return `${header}<section class="card"><ul class="rows">${list
    .map(
      (r) => `<li class="${r.active ? '' : 'inactive'}"><button type="button" class="row" data-action="edit-recurring" data-id="${r.id}">
        ${catBadge(r.categoryId)}
        <span class="row-main"><span class="row-title">${h(r.description || catName(byId('categories', r.categoryId)))}</span>
          <span class="row-meta">${h(t(`recurring.frequency.${r.frequency}`))} · ${h(
            r.active ? t('recurring.next', { date: formatDate(r.nextDate) }) : t('recurring.paused'),
          )} · ${h(t(`recurring.mode.${r.mode}`))}</span></span>
        <span class="row-amount ${r.type}">${h(money(r.amount, r.currency))}</span>
      </button></li>`,
    )
    .join('')}</ul></section>`;
}

function categoryOptions(kind, selected) {
  return rootCategories(kind)
    .map(
      (c) =>
        `<option value="${c.id}" ${selected === c.id ? 'selected' : ''}>${h(catName(c))}</option>` +
        childrenOf(c.id)
          .map((s) => `<option value="${s.id}" ${selected === s.id ? 'selected' : ''}>&nbsp;&nbsp;› ${h(catName(s))}</option>`)
          .join(''),
    )
    .join('');
}

function recurringForm(r) {
  const type = r?.type ?? 'expense';
  return `<form class="sheet" data-form="recurring" novalidate>
    <header class="sheet-header"><h2>${h(t(r ? 'recurring.editTitle' : 'recurring.newTitle'))}</h2>
      <button type="button" class="btn-icon" data-action="close-dialog" aria-label="${h(t('common.close'))}">${icon('close')}</button></header>
    <input type="hidden" name="id" value="${r?.id ?? ''}">
    <fieldset class="segmented"><legend class="sr-only">${h(t('movementForm.type'))}</legend>
      ${['expense', 'income'].map((k) => `<label><input type="radio" name="type" value="${k}" ${type === k ? 'checked' : ''} data-change="rec-type"><span>${h(t(`common.${k}`))}</span></label>`).join('')}
    </fieldset>
    <label>${h(t('movementForm.description'))}<input name="description" maxlength="120" autofocus value="${h(r?.description ?? '')}" placeholder="${h(t('recurring.descriptionHint'))}"></label>
    <div class="grid-2">
      <label>${h(t('movementForm.amount'))}<input name="amount" inputmode="decimal" required value="${h(amountForInput(r?.amount))}" placeholder="0,00"></label>
      <label>${h(t('movementForm.currency'))}<select name="currency">${currencyOptions(r?.currency ?? state.settings.lastCurrency)}</select></label>
    </div>
    <label>${h(t('movementForm.category'))}<select name="categoryId" id="rec-category" required><option value="">${h(t('recurring.chooseCategory'))}</option>${categoryOptions(type, r?.categoryId)}</select></label>
    <div class="grid-2">
      <label>${h(t('recurring.frequencyLabel'))}<select name="frequency">
        ${['monthly', 'weekly', 'yearly'].map((f) => `<option value="${f}" ${r?.frequency === f ? 'selected' : ''}>${h(t(`recurring.frequency.${f}`))}</option>`).join('')}
      </select></label>
      <label>${h(t('recurring.nextDate'))}<input type="date" name="nextDate" required value="${r?.nextDate ?? todayISO()}"></label>
    </div>
    <fieldset class="radio-list"><legend>${h(t('recurring.modeLabel'))}</legend>
      ${['confirm', 'auto'].map((m) => `<label class="check"><input type="radio" name="mode" value="${m}" ${(r?.mode ?? 'confirm') === m ? 'checked' : ''}> <span><strong>${h(t(`recurring.mode.${m}`))}</strong><br><span class="muted small">${h(t(`recurring.modeHint.${m}`))}</span></span></label>`).join('')}
    </fieldset>
    <label>${h(t('movementForm.payment'))}<select name="paymentMethod"><option value="">${h(t('common.none'))}</option>
      ${PAYMENT_METHODS.map((p) => `<option value="${p}" ${r?.paymentMethod === p ? 'selected' : ''}>${h(t(`payment.${p}`))}</option>`).join('')}</select></label>
    ${r ? `<label class="check"><input type="checkbox" name="active" ${r.active ? 'checked' : ''}> ${h(t('recurring.active'))}</label>` : ''}
    <p class="form-error" role="alert"></p>
    <div class="sheet-actions">
      ${r ? `<button type="button" class="btn btn-danger-ghost" data-action="delete-recurring" data-id="${r.id}">${icon('trash')} ${h(t('common.delete'))}</button>` : ''}
      <button class="btn btn-primary btn-wide">${h(t('common.save'))}</button>
    </div>
  </form>`;
}

onChange({
  'rec-type': (el) => {
    el.form.querySelector('#rec-category').innerHTML = `<option value="">${h(t('recurring.chooseCategory'))}</option>${categoryOptions(el.value, null)}`;
  },
});

onClick({
  'new-recurring': () => openDialog(recurringForm(null)),
  'edit-recurring': (el) => openDialog(recurringForm(byId('recurring', el.dataset.id))),
  'delete-recurring': async (el) => {
    if (!(await confirmDialog(t('recurring.deleteConfirm'), { confirm: t('common.delete'), danger: true }))) return;
    await softDelete('recurring', el.dataset.id);
    toast(t('recurring.deleted'));
  },
});

onSubmit({
  recurring: async (data, form) => {
    const error = form.querySelector('.form-error');
    const amount = parseAmount(data.get('amount'));
    if (!(amount > 0)) return (error.textContent = t('movementForm.errors.amount'));
    if (!data.get('categoryId')) return (error.textContent = t('movementForm.errors.category'));
    if (!data.get('nextDate')) return (error.textContent = t('recurring.errors.date'));
    const id = data.get('id') || undefined;
    const nextDate = data.get('nextDate');
    await save('recurring', {
      ...(id ? byId('recurring', id) : {}),
      id,
      type: data.get('type'),
      description: data.get('description').trim(),
      amount,
      currency: data.get('currency'),
      categoryId: data.get('categoryId'),
      frequency: data.get('frequency'),
      nextDate,
      day: Number(nextDate.slice(8)),
      mode: data.get('mode'),
      paymentMethod: data.get('paymentMethod') || null,
      active: id ? data.get('active') === 'on' : true,
    });
    closeDialog();
    const created = await processRecurring();
    toast(created ? t('recurring.savedCreated', { n: created }) : t('recurring.saved'), { tone: 'success' });
  },
});

