// Student list: add one by one or paste a list, edit, leave out of the
// arrangement, remove. Duplicate names are allowed but flagged.
import { state, commit, notify, view, undo } from '../store.js';
import { createStudent, parseNames, nameKey } from '../model.js';
import { removeStudents, setIncluded } from '../classroom.js';
import { t } from '../i18n.js';
import { h, icon } from '../util.js';
import { onClick, onSubmit, onChange, onInput, openDialog, closeDialog, dialogHeader, confirmDialog, toast } from './dom.js';

/** @typedef {import('../store.js').View} View */

/** @param {View} v */
export function studentsPanelHTML(v) {
  const { doc } = v;
  const total = doc.students.length;
  const over = v.includedCount > v.usableSeats;
  const showFilter = total > 12;
  const query = nameKey(state.ui.studentQuery);
  const rows = doc.students
    .filter((s) => !query || nameKey(s.name).includes(query))
    .map((s) => studentRow(s, v))
    .join('');
  return `
    <form class="add-row" data-form="add-student">
      <label class="sr-only" for="new-student">${h(t('students.nameLabel'))}</label>
      <input id="new-student" name="name" maxlength="60" placeholder="${h(t('students.addPlaceholder'))}" autocomplete="off" required>
      <button type="submit" class="btn btn-secondary">${icon('plus')}<span>${h(t('common.add'))}</span></button>
    </form>
    <div class="panel-row">
      <button type="button" class="btn btn-link" data-action="paste-students">${icon('paste')}<span>${h(t('students.paste'))}</span></button>
      ${total ? `<button type="button" class="btn btn-link btn-link-danger" data-action="remove-all-students">${h(t('students.removeAll'))}</button>` : ''}
    </div>
    <p class="counts${over ? ' counts-over' : ''}">
      ${over ? icon('alert') : ''}
      ${h(t('students.counts', { total, included: v.includedCount, seats: v.usableSeats }))}
      ${over ? `<span class="counts-warn">${h(t('students.tooMany', { count: v.includedCount - v.usableSeats }))}</span>` : ''}
    </p>
    ${
      showFilter
        ? `<div class="search-row">${icon('search')}<label class="sr-only" for="student-filter">${h(t('students.filter'))}</label>
           <input id="student-filter" type="search" placeholder="${h(t('students.filter'))}" value="${h(state.ui.studentQuery)}" data-input="filter-students" autocomplete="off"></div>`
        : ''
    }
    ${
      total
        ? rows
          ? `<ul class="student-list">${rows}</ul>`
          : `<p class="empty-hint">${h(t('students.noMatch'))}</p>`
        : `<div class="empty-state">${icon('users', 'icon empty-icon')}<p>${h(t('students.empty'))}</p></div>`
    }`;
}

/** @param {import('../model.js').Student} s @param {View} v */
function studentRow(s, v) {
  const name = v.studentLabel(s.id);
  const seat = v.seatOf.get(s.id);
  const where = !s.included ? t('students.excluded') : seat ? v.seatLabel(seat) : v.doc.plan ? t('students.unseated') : '';
  const rules = v.rulesOf(s.id).length;
  const selected = state.ui.selection?.studentId === s.id;
  const bad = v.brokenStudents.has(s.id);
  return `<li class="student-row${selected ? ' is-selected' : ''}${s.included ? '' : ' is-excluded'}">
    <input type="checkbox" class="check" data-change="toggle-included" data-id="${s.id}" ${s.included ? 'checked' : ''}
      aria-label="${h(t('students.includeLabel', { name }))}" title="${h(t('students.includeHint'))}">
    <button type="button" class="student-name" data-action="select-student" data-id="${s.id}" aria-pressed="${selected}">
      <span class="student-text">${h(name)}</span>
      ${v.duplicates.has(s.id) ? `<span class="badge badge-warn" title="${h(t('students.duplicateHint'))}">${h(t('students.duplicate'))}</span>` : ''}
    </button>
    <span class="student-meta">
      ${rules ? `<span class="meta-rules" title="${h(t('students.rulesCount', { count: rules }))}">${icon('rules')}${rules}</span>` : ''}
      ${where ? `<span class="meta-seat${bad ? ' is-bad' : ''}">${h(where)}</span>` : ''}
    </span>
    <span class="row-buttons">
      <button type="button" class="icon-btn" data-action="edit-student" data-id="${s.id}" aria-label="${h(t('students.edit', { name }))}">${icon('pencil')}</button>
      <button type="button" class="icon-btn" data-action="remove-student" data-id="${s.id}" aria-label="${h(t('students.remove', { name }))}">${icon('trash')}</button>
    </span>
  </li>`;
}

function addStudents(names) {
  commit((d) => {
    for (const name of names) d.students.push(createStudent(name));
  });
}

const existingKeys = () => new Set(state.doc.students.map((s) => nameKey(s.name)));

onSubmit({
  'add-student': (data, form) => {
    const name = String(data.get('name') ?? '').replace(/\s+/g, ' ').trim();
    if (!name) return;
    const existing = state.doc.students.find((s) => nameKey(s.name) === nameKey(name));
    addStudents([name]);
    form.reset();
    document.getElementById('new-student')?.focus();
    if (existing) toast(t('students.duplicateAdded', { name: existing.name }), { kind: 'warn' });
  },

  'paste-students': (data) => {
    const skip = data.get('skip') === 'on';
    const keys = existingKeys();
    const names = [];
    let skipped = 0;
    for (const name of parseNames(String(data.get('names') ?? ''))) {
      const key = nameKey(name);
      if (skip && keys.has(key)) {
        skipped++;
        continue;
      }
      keys.add(key);
      names.push(name);
    }
    closeDialog();
    if (!names.length) {
      toast(t('students.pasteNothing'), { kind: 'warn' });
      return;
    }
    addStudents(names);
    toast(t('students.pasteDone', { count: names.length, skipped }), { kind: 'success', action: { label: t('common.undo'), run: undo } });
  },

  'edit-student': (data) => {
    const id = String(data.get('id'));
    const name = String(data.get('name') ?? '').replace(/\s+/g, ' ').trim();
    if (!name) return;
    commit((d) => {
      const s = d.students.find((x) => x.id === id);
      if (!s) return false;
      s.name = name;
      s.notes = String(data.get('notes') ?? '').trim();
    });
    closeDialog();
  },
});

/** Counts what pasted text will add, live. */
function pastePreview() {
  const area = /** @type {HTMLTextAreaElement} */ (document.getElementById('paste-names'));
  const skip = /** @type {HTMLInputElement} */ (document.getElementById('paste-skip'))?.checked;
  const out = document.getElementById('paste-summary');
  if (!area || !out) return;
  const keys = existingKeys();
  let fresh = 0;
  let known = 0;
  let repeated = 0;
  const seen = new Set();
  for (const name of parseNames(area.value)) {
    const key = nameKey(name);
    if (keys.has(key)) known++;
    else if (seen.has(key)) repeated++;
    else fresh++;
    seen.add(key);
  }
  const total = fresh + known + repeated;
  out.textContent = total
    ? t('students.pastePreview', { total, adding: skip ? fresh : total, known, repeated })
    : t('students.pasteEmpty');
}

onInput({
  'paste-preview': pastePreview,
  'filter-students': (el) => {
    state.ui.studentQuery = el.value;
    notify();
  },
});

onChange({
  'paste-preview': pastePreview,
  'toggle-included': (el) => {
    commit((d) => setIncluded(d, el.dataset.id, el.checked));
  },
});

onClick({
  'paste-students': () => {
    openDialog(`
      <form class="dialog-form" data-form="paste-students">
        ${dialogHeader(h(t('students.pasteTitle')), h(t('students.pasteSubtitle')))}
        <label class="sr-only" for="paste-names">${h(t('students.pasteLabel'))}</label>
        <textarea id="paste-names" name="names" rows="10" class="textarea" data-input="paste-preview" placeholder="${h(t('students.pastePlaceholder'))}"></textarea>
        <label class="check-label"><input type="checkbox" id="paste-skip" name="skip" class="check" checked data-change="paste-preview"> ${h(t('students.pasteSkip'))}</label>
        <p class="muted" id="paste-summary" aria-live="polite">${h(t('students.pasteEmpty'))}</p>
        <footer class="dialog-foot">
          <button type="button" class="btn btn-ghost" data-action="close-dialog">${h(t('common.cancel'))}</button>
          <button type="submit" class="btn btn-primary">${h(t('students.pasteSubmit'))}</button>
        </footer>
      </form>`);
  },

  'edit-student': (el) => {
    const s = state.doc.students.find((x) => x.id === el.dataset.id);
    if (!s) return;
    openDialog(`
      <form class="dialog-form" data-form="edit-student">
        ${dialogHeader(h(t('students.editTitle')))}
        <input type="hidden" name="id" value="${s.id}">
        <label class="field"><span class="field-label">${h(t('students.nameLabel'))}</span>
          <input class="input" name="name" value="${h(s.name)}" maxlength="60" required autocomplete="off"></label>
        <label class="field"><span class="field-label">${h(t('students.notesLabel'))}</span>
          <textarea class="textarea" name="notes" rows="3" maxlength="300" placeholder="${h(t('students.notesPlaceholder'))}">${h(s.notes)}</textarea></label>
        <footer class="dialog-foot">
          <button type="button" class="btn btn-ghost" data-action="close-dialog">${h(t('common.cancel'))}</button>
          <button type="submit" class="btn btn-primary">${h(t('common.save'))}</button>
        </footer>
      </form>`);
  },

  'remove-student': (el) => {
    const v = view();
    const id = el.dataset.id;
    const name = v.studentLabel(id);
    if (state.ui.selection?.studentId === id) state.ui.selection = null;
    let droppedRules = 0;
    commit((d) => {
      droppedRules = removeStudents(d, [id]);
    });
    const message = droppedRules ? t('students.removedWithRules', { name, count: droppedRules }) : t('students.removed', { name });
    toast(message, { action: { label: t('common.undo'), run: undo } });
  },

  'remove-all-students': async () => {
    const count = state.doc.students.length;
    const ok = await confirmDialog({
      title: h(t('students.removeAllTitle', { count })),
      body: `<p>${h(t('students.removeAllBody'))}</p>`,
      confirm: t('students.removeAllConfirm', { count }),
    });
    if (!ok) return;
    state.ui.selection = null;
    commit((d) => {
      removeStudents(d, d.students.map((s) => s.id));
    });
    toast(t('students.removedAll', { count }), { action: { label: t('common.undo'), run: undo } });
  },

  'toggle-included-btn': (el) => {
    const s = state.doc.students.find((x) => x.id === el.dataset.id);
    if (s) commit((d) => setIncluded(d, s.id, !s.included));
  },
});
