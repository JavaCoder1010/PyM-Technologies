// Seating rules: the list (with each rule's status in the current plan) and
// the rule editor, which builds rules in plain language.
import { state, commit, view, undo } from '../store.js';
import { createRule, nameKey } from '../model.js';
import { RULE_TYPES, RULE_TYPE_ORDER, incompleteField, canBeSoft } from '../constraints.js';
import { t } from '../i18n.js';
import { h, icon } from '../util.js';
import { onClick, onSubmit, onChange, onInput, openDialog, replaceDialog, closeDialog, dialogHeader, confirmDialog, toast, dialogIsOpen } from './dom.js';
import { chartHTML } from './chart.js';
import { ruleSentence, STATUS_ICON } from './messages.js';

/** @typedef {import('../store.js').View} View */
/** @typedef {import('../model.js').Rule} Rule */

const TYPE_ICON = { apart: 'unlink', together: 'link', fixed: 'lock', preferred: 'star', front: 'arrow-up', back: 'arrow-down', avoid: 'ban' };

// ---------- List ----------

/** @param {View} v */
export function rulesPanelHTML(v) {
  const rules = v.doc.rules;
  const group = (strength) => rules.filter((r) => r.strength === strength);
  const section = (strength) => {
    const list = group(strength);
    if (!list.length) return '';
    return `<section class="rule-group">
      <h3 class="section-title">${h(t(`rules.group.${strength}`))} <span class="muted">${list.length}</span></h3>
      <p class="section-hint">${h(t(`rules.groupHint.${strength}`))}</p>
      <ul class="rule-list">${list.map((r) => ruleRow(r, v)).join('')}</ul>
    </section>`;
  };
  return `
    <button type="button" class="btn btn-secondary btn-block" data-action="rule-new" ${v.doc.students.length ? '' : 'disabled'}>${icon('plus')}<span>${h(t('rules.add'))}</span></button>
    ${
      rules.length
        ? section('hard') + section('soft')
        : `<div class="empty-state">${icon('rules', 'icon empty-icon')}<p>${h(t(v.doc.students.length ? 'rules.empty' : 'rules.emptyNoStudents'))}</p></div>`
    }`;
}

/** @param {Rule} rule @param {View} v */
function ruleRow(rule, v) {
  const status = v.ruleStatus(rule);
  return `<li class="rule-row rs-${status}${rule.active ? '' : ' is-off'}">
    <span class="rule-icon">${icon(TYPE_ICON[rule.type] ?? 'rules')}</span>
    <div class="rule-body">
      <p class="rule-text">${ruleSentence(rule, v)}</p>
      <p class="rule-status">${icon(STATUS_ICON[status])}<span>${h(t(`rules.status.${status}`))}</span>
        ${rule.strength === 'soft' && rule.importance === 'high' ? `<span class="tag">${h(t('rules.importance.high'))}</span>` : ''}</p>
    </div>
    <div class="rule-actions">
      <label class="switch" title="${h(t(rule.active ? 'rules.turnOff' : 'rules.turnOn'))}">
        <input type="checkbox" data-change="rule-active" data-id="${rule.id}" ${rule.active ? 'checked' : ''} aria-label="${h(t('rules.activeLabel'))}">
        <span class="switch-track" aria-hidden="true"></span>
      </label>
      <button type="button" class="icon-btn" data-action="rule-edit" data-id="${rule.id}" aria-label="${h(t('rules.edit'))}">${icon('pencil')}</button>
      <button type="button" class="icon-btn" data-action="rule-delete" data-id="${rule.id}" aria-label="${h(t('rules.delete'))}">${icon('trash')}</button>
    </div>
  </li>`;
}

const findRule = (id) => state.doc.rules.find((r) => r.id === id);

onChange({
  'rule-active': (el) => {
    commit((d) => {
      const rule = d.rules.find((r) => r.id === el.dataset.id);
      if (!rule) return false;
      rule.active = el.checked;
    });
  },
});

onClick({
  'rule-new': (el) => openRuleEditor(null, { studentIds: el.dataset.student ? [el.dataset.student] : [] }),
  'rule-edit': (el) => {
    const rule = findRule(el.dataset.id);
    if (rule) openRuleEditor(rule);
  },
  'rule-delete': (el) => {
    const rule = findRule(el.dataset.id);
    if (!rule) return;
    commit((d) => {
      d.rules = d.rules.filter((r) => r.id !== rule.id);
    });
    toast(t('rules.deleted'), { action: { label: t('common.undo'), run: undo } });
  },
  'rule-soften': (el) => {
    commit((d) => {
      const rule = d.rules.find((r) => r.id === el.dataset.id);
      if (!rule || !canBeSoft(rule)) return false;
      rule.strength = 'soft';
    });
    toast(t('rules.softened'), { action: { label: t('common.undo'), run: undo } });
  },
  'rule-toggle': (el) => {
    commit((d) => {
      const rule = d.rules.find((r) => r.id === el.dataset.id);
      if (!rule) return false;
      rule.active = !rule.active;
    });
  },
});

// ---------- Editor ----------

/** @type {Rule | null} rule being edited (a copy) */
let draft = null;
let editingId = null;
let preset = { studentIds: [] };

/**
 * @param {Rule | null} rule existing rule, or null for a new one
 * @param {{ studentIds?: string[] }} [presetFields]
 */
export function openRuleEditor(rule, presetFields = {}) {
  editingId = rule?.id ?? null;
  preset = { studentIds: presetFields.studentIds ?? [] };
  if (rule) {
    draft = structuredClone(rule);
    openDialog(editorHTML(), { wide: true, onClose: reset });
  } else {
    draft = null;
    openDialog(typePickerHTML(), { wide: true, onClose: reset });
  }
}

function reset() {
  draft = null;
  editingId = null;
}

function typePickerHTML() {
  return `<div class="dialog-form">
    ${dialogHeader(h(t('rules.pickTitle')), h(t('rules.pickSubtitle')))}
    <div class="type-grid">
      ${RULE_TYPE_ORDER.map(
        (type) => `<button type="button" class="type-card" data-action="rule-type" data-type="${type}">
          <span class="type-icon">${icon(TYPE_ICON[type])}</span>
          <span class="type-name">${h(t(`rules.types.${type}.name`))}</span>
          <span class="type-desc">${h(t(`rules.types.${type}.desc`))}</span>
          <span class="type-kind">${h(t(`rules.types.${type}.kind`))}</span>
        </button>`,
      ).join('')}
    </div>
  </div>`;
}

function newDraft(type) {
  const def = RULE_TYPES[type];
  const params = {};
  for (const [key, spec] of Object.entries(def.params ?? {})) params[key] = spec.default;
  return createRule(type, {
    strength: def.defaultStrength,
    params,
    studentIds: preset.studentIds.slice(0, def.students.max),
  });
}

function editorHTML() {
  const v = view();
  const def = RULE_TYPES[draft.type];
  const type = draft.type;
  const students = [...v.doc.students].sort((a, b) => Number(b.included) - Number(a.included));
  const single = def.students.max === 1;

  const studentField = single
    ? `<label class="field"><span class="field-label">${h(t('rules.editor.student'))}</span>
        <select class="input" data-change="rule-student" required>
          <option value="">${h(t('rules.editor.chooseStudent'))}</option>
          ${students
            .map((s) => `<option value="${s.id}" ${draft.studentIds[0] === s.id ? 'selected' : ''}>${h(v.studentLabel(s.id))}${s.included ? '' : ` (${h(t('students.excluded'))})`}</option>`)
            .join('')}
        </select></label>`
    : `<fieldset class="field">
        <legend class="field-label">${h(t('rules.editor.students'))} <span class="muted" id="rule-student-count">${h(studentCount(def))}</span></legend>
        ${students.length > 8 ? `<input type="search" class="input input-sm" placeholder="${h(t('students.filter'))}" data-input="rule-filter" aria-label="${h(t('students.filter'))}">` : ''}
        <div class="check-list" id="rule-students">
          ${students
            .map(
              (s) => `<label class="check-label" data-name="${h(nameKey(s.name))}"><input type="checkbox" class="check" data-change="rule-student-toggle" value="${s.id}" ${draft.studentIds.includes(s.id) ? 'checked' : ''}>
                <span>${h(v.studentLabel(s.id))}</span>${s.included ? '' : `<span class="muted"> · ${h(t('students.excluded'))}</span>`}</label>`,
            )
            .join('')}
        </div>
      </fieldset>`;

  const seatField = def.seats
    ? `<fieldset class="field">
        <legend class="field-label">${h(t(def.seats.max === 1 ? 'rules.editor.seat' : 'rules.editor.seats'))}</legend>
        <p class="field-hint">${h(t(def.seats.max === 1 ? 'rules.editor.seatHint' : 'rules.editor.seatsHint'))}</p>
        <div class="mini-chart" id="rule-seat-picker">${chartHTML(v, { mode: 'pick', picked: new Set(draft.seatIds), compact: true })}</div>
        <p class="muted" id="rule-seat-summary" aria-live="polite">${seatSummary(v)}</p>
      </fieldset>`
    : '';

  const rows = def.params?.rows;
  const rowsField = rows
    ? `<div class="field">
        <label class="field-label" for="rule-rows">${h(t(`rules.editor.rows.${type}`))}</label>
        <div class="inline-field">
          <input id="rule-rows" class="input input-num" type="number" min="${rows.min}" max="${Math.max(1, v.topo.rowCount)}" value="${draft.params.rows}" data-input="rule-rows">
          <span class="muted">${h(t('rules.editor.rowsOf', { count: v.topo.rowCount }))}</span>
        </div>
        <div class="mini-chart" id="rule-row-preview">${rowPreview(v)}</div>
      </div>`
    : '';

  const strengthField =
    def.strengths.length > 1
      ? `<fieldset class="field">
          <legend class="field-label">${h(t('rules.editor.strength'))}</legend>
          <div class="segmented">
            ${['hard', 'soft']
              .map(
                (s) => `<label class="segment"><input type="radio" name="strength" value="${s}" data-change="rule-strength" ${draft.strength === s ? 'checked' : ''}>
                  <span><strong>${h(t(`rules.strength.${s}`))}</strong><small>${h(t(`rules.strengthHint.${s}`))}</small></span></label>`,
              )
              .join('')}
          </div>
        </fieldset>`
      : `<p class="field-note">${icon('info')}<span>${h(t(`rules.onlyStrength.${def.strengths[0]}`))}</span></p>`;

  return `<form class="dialog-form rule-form" data-form="save-rule" novalidate>
    ${dialogHeader(`${icon(TYPE_ICON[type])} ${h(t(`rules.types.${type}.name`))}`, h(t(`rules.types.${type}.desc`)))}
    ${studentField}
    ${seatField}
    ${rowsField}
    ${strengthField}
    <div id="rule-importance">${importanceField()}</div>
    <div class="rule-preview" aria-live="polite"><span class="field-label">${h(t('rules.editor.preview'))}</span><p id="rule-preview">${previewText(v)}</p></div>
    <p class="form-error" id="rule-error" role="alert"></p>
    <footer class="dialog-foot">
      ${editingId ? `<button type="button" class="btn btn-ghost btn-danger-text" data-action="rule-delete-in-editor">${icon('trash')}<span>${h(t('common.delete'))}</span></button>` : ''}
      <span class="spacer"></span>
      ${editingId ? '' : `<button type="button" class="btn btn-ghost" data-action="rule-back">${h(t('common.back'))}</button>`}
      <button type="button" class="btn btn-ghost" data-action="close-dialog">${h(t('common.cancel'))}</button>
      <button type="submit" class="btn btn-primary">${h(t(editingId ? 'common.save' : 'rules.editor.create'))}</button>
    </footer>
  </form>`;
}

const studentCount = (def) =>
  def.students.max >= 40 ? t('rules.editor.selectedAny', { count: draft.studentIds.length }) : t('rules.editor.selectedRange', { count: draft.studentIds.length, min: def.students.min, max: def.students.max });

function importanceField() {
  if (draft.strength !== 'soft') return '';
  return `<label class="field"><span class="field-label">${h(t('rules.editor.importance'))}</span>
    <select class="input" data-change="rule-importance">
      ${['normal', 'high'].map((i) => `<option value="${i}" ${draft.importance === i ? 'selected' : ''}>${h(t(`rules.importance.${i}`))}</option>`).join('')}
    </select></label>`;
}

function seatSummary(v) {
  if (!draft.seatIds.length) return h(t('rules.editor.noSeats'));
  return h(t('rules.editor.seatsChosen', { seats: draft.seatIds.map((id) => v.seatLabel(id)).join(', ') }));
}

function rowPreview(v) {
  const rows = Number(draft.params.rows) || 1;
  const fn = draft.type === 'front' ? v.topo.inFrontRows : v.topo.inBackRows;
  const highlight = new Set(v.topo.usableIds.filter((id) => fn(id, rows)));
  return chartHTML(v, { mode: 'print', highlight, compact: true });
}

function previewText(v) {
  const complete = draft.studentIds.length && (!RULE_TYPES[draft.type].seats || draft.seatIds.length);
  return complete ? ruleSentence(draft, v) : `<span class="muted">${h(t('rules.editor.previewEmpty'))}</span>`;
}

/** Refreshes the parts of the editor that depend on the draft. */
function refresh() {
  const v = view();
  const def = RULE_TYPES[draft.type];
  const set = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };
  set('rule-preview', previewText(v));
  set('rule-importance', importanceField());
  const count = document.getElementById('rule-student-count');
  if (count) count.textContent = studentCount(def);
  set('rule-seat-summary', seatSummary(v));
  if (def.params?.rows) set('rule-row-preview', rowPreview(v));
  set('rule-error', '');
}

onClick({
  'rule-type': (el) => {
    draft = newDraft(el.dataset.type);
    replaceDialog(editorHTML());
  },
  'rule-back': () => {
    draft = null;
    replaceDialog(typePickerHTML());
  },
  'pick-seat': (el) => {
    if (!draft) return;
    const id = el.dataset.seat;
    const def = RULE_TYPES[draft.type];
    if (def.seats.max === 1) draft.seatIds = draft.seatIds[0] === id ? [] : [id];
    else draft.seatIds = draft.seatIds.includes(id) ? draft.seatIds.filter((s) => s !== id) : [...draft.seatIds, id];
    const picked = new Set(draft.seatIds);
    for (const button of document.querySelectorAll('#rule-seat-picker [data-seat]')) {
      const on = picked.has(button.getAttribute('data-seat'));
      button.classList.toggle('is-picked', on);
      button.setAttribute('aria-pressed', String(on));
    }
    refresh();
  },
  'rule-delete-in-editor': async () => {
    const id = editingId;
    closeDialog();
    if (!(await confirmDialog({ title: h(t('rules.deleteConfirm')), confirm: t('common.delete') }))) return;
    commit((d) => {
      d.rules = d.rules.filter((r) => r.id !== id);
    });
  },
});

onChange({
  'rule-student': (el) => {
    draft.studentIds = el.value ? [el.value] : [];
    refresh();
  },
  'rule-student-toggle': (el) => {
    const id = el.value;
    draft.studentIds = el.checked ? [...draft.studentIds, id] : draft.studentIds.filter((s) => s !== id);
    refresh();
  },
  'rule-strength': (el) => {
    draft.strength = el.value;
    refresh();
  },
  'rule-importance': (el) => {
    draft.importance = el.value;
    refresh();
  },
});

onInput({
  'rule-rows': (el) => {
    const n = Math.round(Number(el.value));
    if (!Number.isFinite(n) || n < 1) return;
    draft.params = { ...draft.params, rows: n };
    refresh();
  },
  'rule-filter': (el) => {
    const q = nameKey(el.value);
    for (const label of document.querySelectorAll('#rule-students [data-name]')) {
      /** @type {HTMLElement} */ (label).hidden = Boolean(q) && !label.getAttribute('data-name').includes(q);
    }
  },
});

onSubmit({
  'save-rule': () => {
    if (!draft || !dialogIsOpen()) return;
    const def = RULE_TYPES[draft.type];
    const missing = incompleteField(draft);
    if (missing) {
      const message =
        missing === 'students'
          ? def.students.max === 1
            ? t('rules.editor.needStudent')
            : t('rules.editor.needStudents', { min: def.students.min, max: def.students.max })
          : t(def.seats.max === 1 ? 'rules.editor.needSeat' : 'rules.editor.needSeats');
      document.getElementById('rule-error').textContent = message;
      return;
    }
    const rule = { ...draft, studentIds: [...new Set(draft.studentIds)] };
    const id = editingId;
    commit((d) => {
      if (id) d.rules = d.rules.map((r) => (r.id === id ? rule : r));
      else d.rules.push(rule);
    });
    state.ui.tab = 'rules';
    closeDialog();
    toast(t(id ? 'rules.saved' : 'rules.added'), { kind: 'success' });
  },
});
