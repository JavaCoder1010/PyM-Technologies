// Categorías predefinidas y personalizadas, con subcategorías.
import { t } from '../i18n.js';
import { h } from '../util.js';
import { alive, byId, save } from '../store.js';
import { catIcon, catName, childrenOf, rootCategories } from '../model.js';
import { nextColor } from '../defaults.js';
import { closeDialog, onClick, onSubmit, openDialog, toast } from '../ui.js';
import { icon, pageHeader } from './common.js';

let showArchived = false;
let rerender = () => {};

export const title = () => t('nav.categories');

export function render() {
  const archived = alive('categories').filter((c) => c.archived);
  return `${pageHeader(t('categories.title'), { subtitle: h(t('categories.subtitle')) })}
    ${['expense', 'income'].map(section).join('')}
    ${archived.length ? `<section class="card">
      <button type="button" class="btn btn-ghost" data-action="toggle-archived" aria-expanded="${showArchived}">${h(t('categories.archivedCount', { n: archived.length }))}</button>
      ${showArchived ? `<ul class="rows">${archived
        .map(
          (c) => `<li><div class="row row-static"><span class="cat-dot" style="--cat:${h(c.color)}" aria-hidden="true">${h(catIcon(c))}</span>
            <span class="row-main"><span class="row-title">${h(catName(c))}</span>${c.parentId ? `<span class="row-meta">${h(catName(byId('categories', c.parentId)))}</span>` : ''}</span>
            <button type="button" class="btn btn-small btn-ghost" data-action="unarchive-category" data-id="${c.id}">${h(t('categories.unarchive'))}</button></div></li>`,
        )
        .join('')}</ul>` : ''}
    </section>` : ''}`;
}

function section(kind) {
  return `<section class="card" aria-labelledby="cats-${kind}">
    <div class="card-head"><h2 id="cats-${kind}">${h(t(`categories.section.${kind}`))}</h2>
      <button type="button" class="btn btn-small btn-primary" data-action="new-category" data-kind="${kind}">${icon('plus')} ${h(t('categories.new'))}</button></div>
    <ul class="cat-admin">${rootCategories(kind)
      .map(
        (c) => `<li>
          <div class="cat-admin-row">
            <span class="cat-dot" style="--cat:${h(c.color)}" aria-hidden="true">${h(catIcon(c))}</span>
            <span class="cat-admin-name">${h(catName(c))}</span>
            <button type="button" class="btn-icon" data-action="new-subcategory" data-id="${c.id}" aria-label="${h(t('categories.addSubLabel', { name: catName(c) }))}">${icon('plus')}</button>
            <button type="button" class="btn-icon" data-action="edit-category" data-id="${c.id}" aria-label="${h(t('categories.editLabel', { name: catName(c) }))}">${icon('edit')}</button>
          </div>
          ${childrenOf(c.id).length ? `<ul class="sub-chips">${childrenOf(c.id)
            .map((s) => `<li><button type="button" class="chip-btn" data-action="edit-category" data-id="${s.id}" aria-label="${h(t('categories.editLabel', { name: catName(s) }))}">${h(catName(s))}</button></li>`)
            .join('')}</ul>` : ''}
        </li>`,
      )
      .join('')}</ul>
  </section>`;
}

function categoryForm({ c = null, kind = 'expense', parentId = null }) {
  const isSub = Boolean(c?.parentId ?? parentId);
  const parent = byId('categories', c?.parentId ?? parentId);
  const color = c?.color ?? parent?.color ?? nextColor(rootCategories(kind, { includeArchived: true }).map((r) => r.color));
  const heading = c ? t('categories.editTitle') : isSub ? t('categories.newSubTitle', { name: catName(parent) }) : t('categories.newTitle');
  return `<form class="sheet" data-form="category" novalidate>
    <header class="sheet-header"><h2>${h(heading)}</h2>
      <button type="button" class="btn-icon" data-action="close-dialog" aria-label="${h(t('common.close'))}">${icon('close')}</button></header>
    <input type="hidden" name="id" value="${c?.id ?? ''}">
    <input type="hidden" name="kind" value="${c?.kind ?? parent?.kind ?? kind}">
    <input type="hidden" name="parentId" value="${c?.parentId ?? parentId ?? ''}">
    <label>${h(t('categories.name'))}<input name="name" required maxlength="40" autofocus value="${h(c ? catName(c) : '')}"></label>
    ${isSub ? '' : `<div class="grid-2">
      <label>${h(t('categories.icon'))}<input name="icon" maxlength="8" value="${h(c?.icon ?? '🏷️')}" aria-describedby="cat-icon-hint"></label>
      <label>${h(t('categories.color'))}<input type="color" name="color" value="${h(color)}"></label>
    </div>
    <p class="muted small" id="cat-icon-hint">${h(t('categories.iconHint'))}</p>`}
    <p class="form-error" role="alert"></p>
    <div class="sheet-actions">
      ${c ? `<button type="button" class="btn btn-danger-ghost" data-action="archive-category" data-id="${c.id}">${h(t('categories.archive'))}</button>` : ''}
      <button class="btn btn-primary btn-wide">${h(t('common.save'))}</button>
    </div>
    ${c ? `<p class="muted small">${h(t('categories.archiveHint'))}</p>` : ''}
  </form>`;
}

export function bind(root, refresh) {
  rerender = refresh;
}

onClick({
  'new-category': (el) => openDialog(categoryForm({ kind: el.dataset.kind })),
  'new-subcategory': (el) => openDialog(categoryForm({ parentId: el.dataset.id })),
  'edit-category': (el) => openDialog(categoryForm({ c: byId('categories', el.dataset.id) })),
  'archive-category': async (el) => {
    const c = byId('categories', el.dataset.id);
    await save('categories', { ...c, archived: true });
    closeDialog();
    toast(t('categories.archived', { name: catName(c) }), { action: t('common.undo'), onAction: () => save('categories', { ...c, archived: false }) });
  },
  'unarchive-category': (el) => save('categories', { ...byId('categories', el.dataset.id), archived: false }),
  'toggle-archived': () => {
    showArchived = !showArchived;
    rerender();
  },
});

onSubmit({
  category: async (data, form) => {
    const name = data.get('name').trim();
    if (!name) return (form.querySelector('.form-error').textContent = t('goals.errors.name'));
    const id = data.get('id') || undefined;
    const prev = id ? byId('categories', id) : { builtin: false, archived: false, order: 99 };
    const parentId = data.get('parentId') || null;
    const renamed = !prev.builtin || name !== catName(prev);
    const color = data.get('color') ?? byId('categories', parentId)?.color ?? prev.color;
    const rec = await save('categories', {
      ...prev,
      id,
      name: renamed ? name : prev.name ?? null,
      icon: parentId ? null : (data.get('icon') ?? '').trim() || '🏷️',
      color,
      kind: data.get('kind'),
      parentId,
    });
    // Las subcategorías comparten el color de su categoría.
    if (!parentId && id) {
      for (const s of childrenOf(rec.id, { includeArchived: true })) if (s.color !== color) await save('categories', { ...s, color });
    }
    closeDialog();
    toast(t('categories.saved'), { tone: 'success' });
  },
});
