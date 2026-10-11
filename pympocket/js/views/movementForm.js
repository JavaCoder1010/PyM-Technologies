// Carga rápida y edición de movimientos. Solo monto y categoría son obligatorios.
import { t } from '../i18n.js';
import { h } from '../util.js';
import { state, alive, byId, save, softDelete, restore, setSetting } from '../store.js';
import { CURRENCIES, SYMBOLS, amountForInput, currentMonth, monthKey, parseAmount, todayISO, money } from '../format.js';
import { budgetLabel, budgetStatus, catIcon, catName, childrenOf, effectiveBudgets, matchesCategory, rootOf, rootsByUsage } from '../model.js';
import { PAYMENT_METHODS } from '../defaults.js';
import { can } from '../plan.js';
import { closeDialog, onChange, onClick, onSubmit, openDialog, toast } from '../ui.js';
import { icon } from './common.js';

let draft = null;

export function openMovementForm({ id = null, type = 'expense' } = {}) {
  const m = id ? byId('movements', id) : null;
  const root = m ? rootOf(m.categoryId) : null;
  draft = {
    id,
    type: m?.type ?? type,
    rootId: root?.id ?? null,
    subId: m && root && m.categoryId !== root.id ? m.categoryId : null,
  };
  openDialog(formHTML(m));
}

function categoryChips(type, selected) {
  return rootsByUsage(type)
    .map(
      (c) => `<label class="chip">
        <input type="radio" name="rootId" value="${c.id}" ${c.id === selected ? 'checked' : ''} data-change="mov-root" required>
        <span><span aria-hidden="true">${h(catIcon(c))}</span> ${h(catName(c))}</span>
      </label>`,
    )
    .join('');
}

function subChips(rootId, selected) {
  const subs = rootId ? childrenOf(rootId) : [];
  if (!subs.length) return '';
  return `<fieldset class="chips chips-sub">
    <legend>${h(t('movementForm.subcategory'))} <span class="muted">${h(t('common.optional'))}</span></legend>
    ${subs
      .map(
        (c) => `<label class="chip chip-small">
          <input type="radio" name="subId" value="${c.id}" ${c.id === selected ? 'checked' : ''} data-change="mov-sub">
          <span>${h(catName(c))}</span></label>`,
      )
      .join('')}
  </fieldset>`;
}

function formHTML(m) {
  const currency = m?.currency ?? state.settings.lastCurrency;
  const descriptions = [...new Set(alive('movements').slice(-300).map((x) => x.description).filter(Boolean))].slice(-50);
  const hasDetails = m && (m.description || m.paymentMethod || m.date !== todayISO());
  return `<form class="sheet" data-form="movement" novalidate>
    <header class="sheet-header">
      <h2 id="mov-title">${h(t(m ? 'movementForm.editTitle' : `movementForm.new.${draft.type}`))}</h2>
      <button type="button" class="btn-icon" data-action="close-dialog" aria-label="${h(t('common.close'))}">${icon('close')}</button>
    </header>

    <fieldset class="segmented">
      <legend class="sr-only">${h(t('movementForm.type'))}</legend>
      ${['expense', 'income']
        .map(
          (k) => `<label><input type="radio" name="type" value="${k}" ${draft.type === k ? 'checked' : ''} data-change="mov-type"><span>${h(t(`common.${k}`))}</span></label>`,
        )
        .join('')}
    </fieldset>

    <div class="amount-field">
      <label for="mov-amount">${h(t('movementForm.amount'))}</label>
      <div class="amount-row">
        <input id="mov-amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00"
          value="${h(amountForInput(m?.amount))}" required ${m ? '' : 'autofocus'} aria-describedby="mov-error">
        <fieldset class="segmented segmented-small">
          <legend class="sr-only">${h(t('movementForm.currency'))}</legend>
          ${CURRENCIES.map(
            (c) => `<label><input type="radio" name="currency" value="${c}" ${c === currency ? 'checked' : ''}><span title="${h(t(`currencies.${c}`))}">${h(SYMBOLS[c])}</span></label>`,
          ).join('')}
        </fieldset>
      </div>
    </div>

    <fieldset class="chips" id="mov-cats">
      <legend>${h(t('movementForm.category'))}</legend>
      ${categoryChips(draft.type, draft.rootId)}
    </fieldset>
    <div id="mov-subs">${subChips(draft.rootId, draft.subId)}</div>

    <details class="more-details" ${hasDetails ? 'open' : ''}>
      <summary>${h(t('movementForm.moreDetails'))}</summary>
      <div class="grid-2">
        <label>${h(t('movementForm.date'))}<input type="date" name="date" value="${m?.date ?? todayISO()}" max="2100-12-31"></label>
        <label>${h(t('movementForm.payment'))}
          <select name="paymentMethod">
            <option value="">${h(t('common.none'))}</option>
            ${PAYMENT_METHODS.map((p) => `<option value="${p}" ${m?.paymentMethod === p ? 'selected' : ''}>${h(t(`payment.${p}`))}</option>`).join('')}
          </select>
        </label>
      </div>
      <label>${h(t('movementForm.description'))}
        <input name="description" maxlength="120" list="mov-descriptions" value="${h(m?.description ?? '')}" placeholder="${h(t('movementForm.descriptionHint'))}">
      </label>
      <datalist id="mov-descriptions">${descriptions.map((d) => `<option value="${h(d)}">`).join('')}</datalist>
    </details>

    <p class="form-error" id="mov-error" role="alert"></p>

    <div class="sheet-actions">
      ${m ? `<button type="button" class="btn btn-danger-ghost" data-action="delete-movement" data-id="${m.id}">${icon('trash')} ${h(t('common.delete'))}</button>` : ''}
      <button type="submit" class="btn btn-primary btn-wide">${h(t('common.save'))}</button>
    </div>
  </form>`;
}

onChange({
  'mov-type': (el) => {
    draft.type = el.value;
    draft.rootId = null;
    draft.subId = null;
    const form = el.form;
    form.querySelector('#mov-cats').innerHTML = `<legend>${h(t('movementForm.category'))}</legend>${categoryChips(draft.type, null)}`;
    form.querySelector('#mov-subs').innerHTML = '';
    if (!draft.id) form.querySelector('#mov-title').textContent = t(`movementForm.new.${draft.type}`);
  },
  'mov-root': (el) => {
    draft.rootId = el.value;
    draft.subId = null;
    el.form.querySelector('#mov-subs').innerHTML = subChips(draft.rootId, null);
  },
  'mov-sub': (el) => (draft.subId = el.value),
});

onSubmit({
  movement: async (data, form) => {
    const error = form.querySelector('#mov-error');
    const amount = parseAmount(data.get('amount'));
    const rootId = data.get('rootId');
    if (!(amount > 0)) {
      error.textContent = t('movementForm.errors.amount');
      form.querySelector('#mov-amount').focus();
      return;
    }
    if (!rootId) {
      error.textContent = t('movementForm.errors.category');
      form.querySelector('[name=rootId]')?.focus();
      return;
    }
    const prev = draft.id ? byId('movements', draft.id) : {};
    const movement = {
      ...prev,
      type: data.get('type'),
      amount,
      currency: data.get('currency'),
      categoryId: data.get('subId') || rootId,
      date: data.get('date') || todayISO(),
      description: (data.get('description') ?? '').trim(),
      paymentMethod: data.get('paymentMethod') || null,
    };
    const before = budgetSnapshot(movement);
    const saved = await save('movements', movement);
    await setSetting('lastCurrency', movement.currency);
    closeDialog();
    toast(t(draft.id ? 'movementForm.updated' : `movementForm.saved.${movement.type}`), { tone: 'success' });
    announceBudget(saved, before);
  },
});

onClick({
  'edit-movement': (el) => openMovementForm({ id: el.dataset.id }),
  'new-movement': (el) => openMovementForm({ type: el.dataset.type || 'expense' }),
  'delete-movement': async (el) => {
    const id = el.dataset.id;
    closeDialog();
    await softDelete('movements', id);
    toast(t('movementForm.deleted'), { action: t('common.undo'), onAction: () => restore('movements', id), timeout: 7000 });
  },
});

// ---------- Alertas de presupuesto al guardar un gasto ----------

function relevantBudgets(m) {
  if (m.type !== 'expense' || !can('budgets')) return [];
  return effectiveBudgets(monthKey(m.date)).filter(
    (b) => b.currency === m.currency && (!b.categoryId || matchesCategory(m, b.categoryId)),
  );
}

function budgetSnapshot(m) {
  const key = monthKey(m.date);
  return new Map(relevantBudgets(m).map((b) => [b.id, budgetStatus(b, key).level]));
}

function announceBudget(m, before) {
  const key = monthKey(m.date);
  if (key !== currentMonth()) return;
  for (const b of relevantBudgets(m)) {
    const s = budgetStatus(b, key);
    if (s.level === 'ok' || before.get(b.id) === s.level) continue;
    const params = { name: budgetLabel(b), pct: Math.round(s.pct * 100), left: money(Math.abs(s.left), b.currency) };
    toast(t(s.level === 'over' ? 'budgets.alertOver' : 'budgets.alertWarn', params), { tone: s.level === 'over' ? 'danger' : 'warn', timeout: 8000 });
  }
}
