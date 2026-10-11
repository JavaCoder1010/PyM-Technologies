// Metas de ahorro: monto objetivo, moneda, fecha límite y ahorro mensual necesario.
import { t } from '../i18n.js';
import { h, sum } from '../util.js';
import { state, alive, byId, save, softDelete } from '../store.js';
import { amountForInput, currentMonth, formatDate, money, monthKey, monthsBetween, parseAmount, percent, todayISO } from '../format.js';
import { can } from '../plan.js';
import { closeDialog, confirmDialog, onClick, onSubmit, openDialog, toast } from '../ui.js';
import { progress } from '../charts.js';
import { currencyOptions, empty, icon, pageHeader, proLock } from './common.js';

export const title = () => t('nav.goals');

export const goalSaved = (g) => sum(g.contributions ?? [], (c) => c.amount);

/** Ahorro mensual necesario para llegar a la meta en fecha. */
export function goalPlan(g) {
  const saved = goalSaved(g);
  const missing = Math.max(g.target - saved, 0);
  const months = g.deadline ? monthsBetween(currentMonth(), monthKey(g.deadline)) + 1 : null;
  const overdue = g.deadline && g.deadline < todayISO();
  return { saved, missing, months, overdue, monthly: months > 0 ? missing / months : null, done: missing === 0 };
}

export function render() {
  const header = pageHeader(t('goals.title'), {
    subtitle: h(t('goals.subtitle')),
    actions: can('goals') ? `<button type="button" class="btn btn-primary" data-action="new-goal">${icon('plus')} <span>${h(t('goals.new'))}</span></button>` : '',
  });
  if (!can('goals')) return header + proLock('goals');
  const goals = alive('goals').sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
  if (!goals.length) {
    return header + empty(t('goals.empty'), t('goals.emptyHint'), `<button type="button" class="btn btn-primary" data-action="new-goal">${icon('plus')} ${h(t('goals.new'))}</button>`);
  }
  return `${header}<div class="goal-grid">${goals.map(goalCard).join('')}</div>`;
}

function goalCard(g) {
  const p = goalPlan(g);
  const ratio = g.target ? p.saved / g.target : 0;
  let plan;
  if (p.done) plan = `<p class="income">🎉 ${h(t('goals.done'))}</p>`;
  else if (p.overdue) plan = `<p class="negative">${h(t('goals.overdue', { amount: money(p.missing, g.currency) }))}</p>`;
  else if (p.monthly != null) plan = `<p>${h(t('goals.monthly', { amount: money(p.monthly, g.currency), n: p.months }))}</p>`;
  else plan = `<p class="muted">${h(t('goals.missing', { amount: money(p.missing, g.currency) }))}</p>`;
  return `<section class="card goal" aria-labelledby="goal-${g.id}">
    <div class="card-head"><h2 id="goal-${g.id}">${h(g.name)}</h2>
      <button type="button" class="btn-icon" data-action="edit-goal" data-id="${g.id}" aria-label="${h(t('goals.editLabel', { name: g.name }))}">${icon('edit')}</button></div>
    <p class="goal-amounts"><strong>${h(money(p.saved, g.currency))}</strong> <span class="muted">${h(t('budgets.of'))} ${h(money(g.target, g.currency))} · ${h(percent(ratio, 0))}</span></p>
    ${progress(ratio, { label: g.name, level: p.done ? 'done' : 'ok' })}
    ${g.deadline ? `<p class="small muted">${h(t('goals.deadline'))}: ${h(formatDate(g.deadline))}</p>` : ''}
    ${plan}
    <div class="row-buttons">
      <button type="button" class="btn btn-small btn-primary" data-action="goal-contribution" data-id="${g.id}">${icon('plus')} ${h(t('goals.contribute'))}</button>
      <button type="button" class="btn btn-small btn-ghost" data-action="goal-withdraw" data-id="${g.id}">${h(t('goals.withdraw'))}</button>
    </div>
  </section>`;
}

function goalForm(g) {
  return `<form class="sheet" data-form="goal" novalidate>
    <header class="sheet-header"><h2>${h(t(g ? 'goals.editTitle' : 'goals.newTitle'))}</h2>
      <button type="button" class="btn-icon" data-action="close-dialog" aria-label="${h(t('common.close'))}">${icon('close')}</button></header>
    <input type="hidden" name="id" value="${g?.id ?? ''}">
    <label>${h(t('goals.name'))}<input name="name" required maxlength="60" autofocus value="${h(g?.name ?? '')}" placeholder="${h(t('goals.nameHint'))}"></label>
    <div class="grid-2">
      <label>${h(t('goals.target'))}<input name="target" inputmode="decimal" required value="${h(amountForInput(g?.target))}" placeholder="0,00"></label>
      <label>${h(t('movementForm.currency'))}<select name="currency">${currencyOptions(g?.currency ?? state.settings.lastCurrency)}</select></label>
    </div>
    <label>${h(t('goals.deadline'))}<input type="date" name="deadline" min="${todayISO()}" value="${g?.deadline ?? ''}"></label>
    ${g ? '' : `<label>${h(t('goals.initial'))} <span class="muted">${h(t('common.optional'))}</span><input name="initial" inputmode="decimal" placeholder="0,00"></label>`}
    <p class="form-error" role="alert"></p>
    <div class="sheet-actions">
      ${g ? `<button type="button" class="btn btn-danger-ghost" data-action="delete-goal" data-id="${g.id}">${icon('trash')} ${h(t('common.delete'))}</button>` : ''}
      <button class="btn btn-primary btn-wide">${h(t('common.save'))}</button>
    </div>
  </form>`;
}

function contributionForm(g, kind) {
  return `<form class="sheet sheet-small" data-form="goal-contribution" novalidate>
    <header class="sheet-header"><h2>${h(t(`goals.${kind}Title`, { name: g.name }))}</h2>
      <button type="button" class="btn-icon" data-action="close-dialog" aria-label="${h(t('common.close'))}">${icon('close')}</button></header>
    <input type="hidden" name="id" value="${g.id}"><input type="hidden" name="kind" value="${kind}">
    <label>${h(t('budgets.amount'))} (${g.currency})<input name="amount" inputmode="decimal" required autofocus placeholder="0,00"></label>
    <p class="form-error" role="alert"></p>
    <div class="sheet-actions"><button class="btn btn-primary btn-wide">${h(t('common.save'))}</button></div>
  </form>`;
}

onClick({
  'new-goal': () => openDialog(goalForm(null)),
  'edit-goal': (el) => openDialog(goalForm(byId('goals', el.dataset.id))),
  'goal-contribution': (el) => openDialog(contributionForm(byId('goals', el.dataset.id), 'contribute')),
  'goal-withdraw': (el) => openDialog(contributionForm(byId('goals', el.dataset.id), 'withdraw')),
  'delete-goal': async (el) => {
    if (!(await confirmDialog(t('goals.deleteConfirm'), { confirm: t('common.delete'), danger: true }))) return;
    await softDelete('goals', el.dataset.id);
    toast(t('goals.deleted'));
  },
});

onSubmit({
  goal: async (data, form) => {
    const error = form.querySelector('.form-error');
    const name = data.get('name').trim();
    const target = parseAmount(data.get('target'));
    if (!name) return (error.textContent = t('goals.errors.name'));
    if (!(target > 0)) return (error.textContent = t('movementForm.errors.amount'));
    const id = data.get('id') || undefined;
    const prev = id ? byId('goals', id) : { contributions: [] };
    const initial = parseAmount(data.get('initial') ?? '');
    const contributions = [...prev.contributions];
    if (initial > 0) contributions.push({ date: todayISO(), amount: initial });
    await save('goals', { ...prev, id, name, target, currency: data.get('currency'), deadline: data.get('deadline') || null, contributions });
    closeDialog();
    toast(t('goals.saved'), { tone: 'success' });
  },
  'goal-contribution': async (data, form) => {
    const amount = parseAmount(data.get('amount'));
    if (!(amount > 0)) return (form.querySelector('.form-error').textContent = t('movementForm.errors.amount'));
    const g = byId('goals', data.get('id'));
    const signed = data.get('kind') === 'withdraw' ? -Math.min(amount, goalSaved(g)) : amount;
    await save('goals', { ...g, contributions: [...(g.contributions ?? []), { date: todayISO(), amount: signed }] });
    closeDialog();
    toast(t('goals.contributionSaved'), { tone: 'success' });
  },
});
