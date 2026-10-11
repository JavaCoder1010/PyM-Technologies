// Papelera: los movimientos eliminados se pueden recuperar durante 30 días.
import { t } from '../i18n.js';
import { h } from '../util.js';
import { state, purge, restore, TRASH_DAYS } from '../store.js';
import { formatDate, money } from '../format.js';
import { catPath } from '../model.js';
import { confirmDialog, onClick, toast } from '../ui.js';
import { catBadge, empty, icon, pageHeader } from './common.js';

export const title = () => t('nav.trash');

const deleted = () => state.movements.filter((m) => m.deletedAt).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

const daysLeft = (m) => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - Date.parse(m.deletedAt)) / 86400000));

export function render() {
  const list = deleted();
  const header = pageHeader(t('trash.title'), {
    subtitle: h(t('trash.subtitle', { days: TRASH_DAYS })),
    actions: list.length ? `<button type="button" class="btn btn-danger-ghost" data-action="empty-trash">${icon('trash')} <span>${h(t('trash.empty'))}</span></button>` : '',
  });
  if (!list.length) return header + empty(t('trash.none'));
  return `${header}<section class="card"><ul class="rows">${list
    .map(
      (m) => `<li><div class="row row-static">${catBadge(m.categoryId)}
        <span class="row-main"><span class="row-title">${h(m.description || catPath(m.categoryId))}</span>
          <span class="row-meta">${h(formatDate(m.date))} · ${h(t('trash.daysLeft', { n: daysLeft(m) }))}</span></span>
        <span class="row-amount ${m.type}">${h(money(m.amount, m.currency))}</span>
        <span class="row-buttons">
          <button type="button" class="btn btn-small btn-primary" data-action="restore-movement" data-id="${m.id}">${h(t('trash.restore'))}</button>
          <button type="button" class="btn-icon" data-action="purge-movement" data-id="${m.id}" aria-label="${h(t('trash.purge'))}">${icon('trash')}</button>
        </span></div></li>`,
    )
    .join('')}</ul></section>`;
}

onClick({
  'restore-movement': async (el) => {
    await restore('movements', el.dataset.id);
    toast(t('trash.restored'), { tone: 'success' });
  },
  'purge-movement': async (el) => {
    if (!(await confirmDialog(t('trash.purgeConfirm'), { confirm: t('trash.purge'), danger: true }))) return;
    await purge('movements', el.dataset.id);
  },
  'empty-trash': async () => {
    if (!(await confirmDialog(t('trash.emptyConfirm'), { confirm: t('trash.empty'), danger: true }))) return;
    await purge('movements', deleted().map((m) => m.id));
  },
});
