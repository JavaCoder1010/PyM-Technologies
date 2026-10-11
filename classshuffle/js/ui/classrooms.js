// Classrooms: the welcome screen, creating, opening, renaming and deleting
// classrooms, the demo, and backup files (export/import as JSON).
import { state, commit, view, openClassroom, openNew, deleteClassroom } from '../store.js';
import { createClassroom, migrate, newId } from '../model.js';
import { createDemoClassroom } from '../demo.js';
import { t, formatDate } from '../i18n.js';
import { h, icon, download, slug } from '../util.js';
import { onClick, onSubmit, onChange, openDialog, closeDialog, dialogHeader, confirmDialog, toast } from './dom.js';
import { layoutFields, readLayoutFields } from './layoutTools.js';

function classroomListHTML() {
  if (!state.index.length) return '';
  return `<ul class="classroom-list">
    ${state.index
      .map(
        (c) => `<li class="classroom-row${state.doc?.id === c.id ? ' is-current' : ''}">
          <button type="button" class="classroom-open" data-action="open-classroom" data-id="${c.id}">
            <span class="classroom-row-name">${h(c.name)}${c.demo ? ` <span class="tag">${h(t('demo.tag'))}</span>` : ''}</span>
            <span class="muted">${h(t('classrooms.meta', { count: c.students, date: formatDate(c.updatedAt) }))}</span>
          </button>
          <span class="row-buttons">
            <button type="button" class="icon-btn" data-action="rename-classroom" data-id="${c.id}" aria-label="${h(t('classrooms.rename', { name: c.name }))}">${icon('pencil')}</button>
            <button type="button" class="icon-btn" data-action="delete-classroom" data-id="${c.id}" aria-label="${h(t('classrooms.delete', { name: c.name }))}">${icon('trash')}</button>
          </span>
        </li>`,
      )
      .join('')}
  </ul>`;
}

const createFormHTML = () => `
  <form class="dialog-form create-form" data-form="create-classroom">
    <label class="field"><span class="field-label">${h(t('classrooms.nameLabel'))}</span>
      <input class="input" name="name" maxlength="60" required placeholder="${h(t('classrooms.namePlaceholder'))}" autocomplete="off"></label>
    <p class="field-label">${h(t('classrooms.layoutLabel'))}</p>
    ${layoutFields()}
    <p class="muted">${h(t('classrooms.layoutLater'))}</p>
    <button type="submit" class="btn btn-primary btn-block">${icon('plus')}<span>${h(t('classrooms.create'))}</span></button>
  </form>`;

/** First screen when no classroom is open. */
export function welcomeHTML() {
  return `<div class="welcome">
    <div class="welcome-intro">
      <svg class="welcome-logo" aria-hidden="true"><use href="#i-logo"/></svg>
      <h1 class="welcome-title">${h(t('app.name'))}</h1>
      <p class="welcome-tagline">${h(t('app.tagline'))}</p>
      <p class="welcome-text">${h(t('welcome.text'))}</p>
      <ol class="welcome-steps">
        ${['layout', 'students', 'rules', 'generate'].map((step, i) => `<li><span class="step-num">${i + 1}</span>${h(t(`welcome.steps.${step}`))}</li>`).join('')}
      </ol>
    </div>
    <div class="welcome-card">
      <h2 class="card-title">${h(t('welcome.createTitle'))}</h2>
      ${createFormHTML()}
      <div class="welcome-alt">
        <button type="button" class="btn btn-link" data-action="open-demo">${icon('sparkle')}<span>${h(t('demo.open'))}</span></button>
        <label class="btn btn-link file-btn">${icon('upload')}<span>${h(t('classrooms.import'))}</span>
          <input type="file" accept="application/json,.json" data-change="import-backup" class="sr-only"></label>
      </div>
      ${state.index.length ? `<h3 class="section-title">${h(t('classrooms.yours'))}</h3>${classroomListHTML()}` : ''}
    </div>
  </div>`;
}

function openClassroomsDialog() {
  openDialog(
    `<div class="dialog-form">
      ${dialogHeader(h(t('classrooms.title')))}
      ${classroomListHTML()}
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-action="new-classroom">${icon('plus')}<span>${h(t('classrooms.new'))}</span></button>
        <button type="button" class="btn btn-ghost" data-action="open-demo">${icon('sparkle')}<span>${h(t('demo.open'))}</span></button>
        <label class="btn btn-ghost file-btn">${icon('upload')}<span>${h(t('classrooms.import'))}</span>
          <input type="file" accept="application/json,.json" data-change="import-backup" class="sr-only"></label>
      </div>
    </div>`,
    { wide: true },
  );
}

/** Opens the demo classroom, creating it (already seated) the first time. */
export async function openDemo() {
  const existing = state.index.find((c) => c.demo);
  if (existing && (await openClassroom(existing.id))) return;
  await openNew(createDemoClassroom({ name: t('demo.name') }));
}

onClick({
  'open-classrooms': openClassroomsDialog,
  'new-classroom': () => openDialog(`<div class="dialog-form">${dialogHeader(h(t('welcome.createTitle')))}${createFormHTML()}</div>`),
  'open-classroom': async (el) => {
    closeDialog();
    if (!(await openClassroom(el.dataset.id))) toast(t('classrooms.missing'), { kind: 'error' });
  },
  'open-demo': () => {
    closeDialog();
    return openDemo();
  },
  'rename-classroom': (el) => {
    const summary = state.index.find((c) => c.id === el.dataset.id);
    if (!summary) return;
    openDialog(`<form class="dialog-form" data-form="rename-classroom">
      ${dialogHeader(h(t('classrooms.renameTitle')))}
      <input type="hidden" name="id" value="${summary.id}">
      <label class="field"><span class="field-label">${h(t('classrooms.nameLabel'))}</span>
        <input class="input" name="name" value="${h(summary.name)}" maxlength="60" required autocomplete="off"></label>
      <footer class="dialog-foot">
        <button type="button" class="btn btn-ghost" data-action="close-dialog">${h(t('common.cancel'))}</button>
        <button type="submit" class="btn btn-primary">${h(t('common.save'))}</button>
      </footer>
    </form>`);
  },
  'delete-classroom': async (el) => {
    const summary = state.index.find((c) => c.id === el.dataset.id);
    if (!summary) return;
    const ok = await confirmDialog({
      title: h(t('classrooms.deleteTitle', { name: summary.name })),
      body: `<p>${h(t('classrooms.deleteBody', { count: summary.students }))}</p>`,
      confirm: t('classrooms.deleteConfirm'),
    });
    if (!ok) return;
    await deleteClassroom(summary.id);
    toast(t('classrooms.deleted', { name: summary.name }));
  },
  'export-backup': () => {
    const doc = state.doc;
    download(`${slug(doc.name)}.classshuffle.json`, JSON.stringify(doc, null, 2), 'application/json');
  },
});

onSubmit({
  'create-classroom': async (data) => {
    const name = String(data.get('name') ?? '').trim();
    if (!name) return;
    closeDialog();
    state.ui.tab = 'students';
    await openNew(createClassroom({ name, ...readLayoutFields(data) }));
    document.getElementById('new-student')?.focus();
  },
  'rename-classroom': async (data) => {
    const id = String(data.get('id'));
    const name = String(data.get('name') ?? '').trim();
    if (!name) return;
    closeDialog();
    if (state.doc?.id !== id && !(await openClassroom(id))) return;
    commit((d) => {
      d.name = name;
    });
  },
});

onChange({
  'import-backup': async (el) => {
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || !Array.isArray(raw.seats) || !Array.isArray(raw.students) || !raw.layout) throw new Error('not a classroom');
      // A new id, so importing never overwrites an existing classroom.
      const doc = migrate({ ...raw, id: newId(), updatedAt: new Date().toISOString() });
      closeDialog();
      await openNew(doc);
      toast(t('classrooms.imported', { name: doc.name }), { kind: 'success' });
    } catch (err) {
      console.error(err);
      toast(t('classrooms.importFailed'), { kind: 'error' });
    }
  },
});

/** Banner shown on the demo classroom. */
export function demoBannerHTML() {
  if (!view().doc.demo) return '';
  return `<div class="demo-banner">${icon('sparkle')}<span>${h(t('demo.banner'))}</span>
    <button type="button" class="btn btn-link btn-sm" data-action="delete-classroom" data-id="${state.doc.id}">${h(t('demo.delete'))}</button></div>`;
}
