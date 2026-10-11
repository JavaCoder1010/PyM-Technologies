// The seating plan: generating it, moving students by hand (never silently
// breaking a must-rule), and the panels around the chart: status bar, result
// notice, students without a seat, the selected student and saved arrangements.
import { state, commit, notify, view, undo } from '../store.js';
import { generateSeating } from '../engine.js';
import { validatePlan } from '../validate.js';
import { placeStudent, emptyPlan } from '../classroom.js';
import { canBeSoft } from '../constraints.js';
import { newId } from '../model.js';
import { t, formatDate } from '../i18n.js';
import { h, icon, nextFrame } from '../util.js';
import { onClick, onSubmit, openDialog, closeDialog, dialogBody, dialogHeader, confirmDialog, toast } from './dom.js';
import { ruleSentence, issueReason, problemExplanation, namesHTML, seatsHTML, STATUS_ICON } from './messages.js';

/** @typedef {import('../store.js').View} View */

// ---------- Generating ----------

export async function generate() {
  const doc = state.doc;
  if (!doc || state.ui.generating) return;
  state.ui.generating = true;
  state.ui.editingLayout = false;
  state.ui.outcome = null;
  notify();
  await nextFrame(); // show the loading state before the work starts

  let result;
  try {
    result = generateSeating({
      seats: doc.seats,
      students: doc.students,
      rules: doc.rules,
      adjacency: doc.adjacency,
      previous: doc.plan?.assignments ?? null,
    });
  } catch (err) {
    console.error(err);
    result = { ok: false, problem: { kind: 'internal', issues: [] } };
  }
  state.ui.generating = false;

  if (!result.ok) {
    state.ui.outcome = { ok: false, problem: result.problem };
    notify();
    return;
  }
  const info = {
    seed: result.seed,
    generatedAt: new Date().toISOString(),
    uniqueness: result.uniqueness,
    attempts: result.stats.attempts,
    nodes: result.stats.nodes,
    ms: result.stats.ms,
  };
  commit((d) => {
    d.plan = {
      id: newId(),
      createdAt: info.generatedAt,
      assignments: result.assignments,
      generated: { assignments: result.assignments, info },
      edited: false,
    };
  });
  state.ui.selection = null;
  state.ui.outcome = { ok: true, uniqueness: result.uniqueness, unmet: result.unmet.length, doc: state.doc };
  notify();
}

// ---------- Moving students by hand ----------

/** Issues in `after` that are new or worse than in `before`. */
function introduced(before, after) {
  const key = (i) => `${i.code}|${i.ruleId ?? [...i.studentIds].sort().join()}`;
  const old = new Map(before.map((i) => [key(i), i.penalty ?? 1]));
  return after.filter((i) => !old.has(key(i)) || (i.penalty ?? 1) > old.get(key(i)));
}

const currentAssignments = () => state.doc.plan?.assignments ?? {};

/**
 * Applies a new set of seat assignments if it breaks no new must-rule;
 * otherwise explains the problem and lets the teacher cancel or change the rule.
 */
function requestPlacement(assignments, subtitle, after) {
  const doc = state.doc;
  const v = view();
  const before = v.validation ?? validatePlan(doc, {}, v.topo);
  const next = validatePlan(doc, assignments, v.topo);
  const hard = introduced(before.hard, next.hard);
  if (hard.length) {
    pending = { assignments, subtitle, revisions: {}, after };
    renderConflict();
    return;
  }
  applyPlacement(assignments, {});
  after?.();
  const soft = introduced(before.soft, next.soft);
  if (soft.length) toast(t('move.softWarning', { count: soft.length }), { kind: 'warn' });
}

function applyPlacement(assignments, revisions) {
  commit((d) => {
    for (const [ruleId, change] of Object.entries(revisions)) {
      const rule = d.rules.find((r) => r.id === ruleId);
      if (!rule) continue;
      if (change === 'soft') rule.strength = 'soft';
      else rule.active = false;
    }
    if (!d.plan) d.plan = emptyPlan();
    d.plan.assignments = assignments;
    d.plan.edited = true;
  });
}

export function moveStudent(studentId, seatId) {
  const v = view();
  if (v.seatOf.get(studentId) === seatId) return;
  const { assignments, displaced } = placeStudent(currentAssignments(), studentId, seatId);
  const subtitle = t('move.subtitle', { name: namesHTML([studentId], v), seat: seatsHTML([seatId], v) });
  requestPlacement(assignments, subtitle, displaced ? () => toast(t('move.displaced', { name: v.studentLabel(displaced) })) : null);
}

function unseat(studentId) {
  const v = view();
  const { [studentId]: _, ...assignments } = currentAssignments();
  requestPlacement(assignments, t('move.unseatSubtitle', { name: namesHTML([studentId], v) }));
}

/** @type {{ assignments: Record<string, string>, subtitle: string, revisions: Record<string, 'soft' | 'off'>, after?: () => void } | null} */
let pending = null;

function renderConflict() {
  const doc = state.doc;
  const v = view();
  const rules = doc.rules.map((r) => {
    const change = pending.revisions[r.id];
    return change === 'soft' ? { ...r, strength: 'soft' } : change === 'off' ? { ...r, active: false } : r;
  });
  const revised = { ...doc, rules };
  const issues = introduced(validatePlan(revised, currentAssignments(), v.topo).hard, validatePlan(revised, pending.assignments, v.topo).hard);
  if (!issues.length) {
    const { assignments, revisions, after } = pending;
    pending = null;
    closeDialog();
    applyPlacement(assignments, revisions);
    after?.();
    toast(t('move.appliedWithChange'), { kind: 'success' });
    return;
  }
  const items = issues
    .map((issue) => {
      const rule = issue.ruleId ? doc.rules.find((r) => r.id === issue.ruleId) : null;
      return `<li class="conflict-item">
        <p class="conflict-reason">${icon('alert', 'icon icon-bad')} <span>${issueReason(issue, v)}</span></p>
        ${
          rule
            ? `<p class="conflict-rule">${t('move.ruleIs')} ${ruleSentence(rule, v)}</p>
               <div class="conflict-actions">
                 ${canBeSoft(rule) ? `<button type="button" class="btn btn-secondary btn-sm" data-action="conflict-soften" data-id="${rule.id}">${h(t('rules.makePreference'))}</button>` : ''}
                 <button type="button" class="btn btn-ghost btn-sm" data-action="conflict-off" data-id="${rule.id}">${h(t('rules.turnOff'))}</button>
               </div>`
            : ''
        }
      </li>`;
    })
    .join('');
  const html = `
    <div class="dialog-form" role="alertdialog" aria-labelledby="conflict-title">
      ${dialogHeader(`<span id="conflict-title">${h(t('move.title'))}</span>`, pending.subtitle)}
      <div class="dialog-text"><p>${h(t('move.explain'))}</p><ul class="conflict-list">${items}</ul></div>
      <footer class="dialog-foot">
        <button type="button" class="btn btn-primary" data-action="close-dialog" autofocus>${h(t('move.cancel'))}</button>
      </footer>
    </div>`;
  if (document.getElementById('conflict-title')) dialogBody().innerHTML = html;
  else openDialog(html, { onClose: () => (pending = null) });
}

onClick({
  'conflict-soften': (el) => {
    if (!pending) return;
    pending.revisions[el.dataset.id] = 'soft';
    renderConflict();
  },
  'conflict-off': (el) => {
    if (!pending) return;
    pending.revisions[el.dataset.id] = 'off';
    renderConflict();
  },
});

// ---------- Selecting and moving on the chart ----------

const select = (selection) => {
  state.ui.selection = selection;
  notify();
};

onClick({
  generate: () => generate(),
  seat: (el) => {
    const seatId = el.dataset.seat;
    const v = view();
    const sel = state.ui.selection;
    const occupant = v.occupant.get(seatId);
    if (sel?.studentId) {
      if (v.seatOf.get(sel.studentId) === seatId) return select(null);
      const id = sel.studentId;
      select(null);
      return moveStudent(id, seatId);
    }
    if (sel?.seatId && sel.seatId !== seatId && occupant && !v.occupant.get(sel.seatId)) {
      // Empty seat chosen first, then a student: move the student into it.
      const target = sel.seatId;
      select(null);
      return moveStudent(occupant, target);
    }
    if (sel?.seatId === seatId) return select(null);
    select(occupant ? { studentId: occupant } : { seatId });
  },
  'select-student': (el) => {
    const id = el.dataset.id;
    const sel = state.ui.selection;
    const v = view();
    if (sel?.seatId && !v.occupant.get(sel.seatId) && el.closest('.tray')) {
      const target = sel.seatId;
      select(null);
      return moveStudent(id, target);
    }
    select(sel?.studentId === id ? null : { studentId: id });
  },
  'clear-selection': () => select(null),
  'unseat-student': (el) => {
    select(null);
    unseat(el.dataset.id);
  },
  'reset-plan': () => {
    commit((d) => {
      d.plan.assignments = { ...d.plan.generated.assignments };
      d.plan.edited = false;
    });
    toast(t('plan.resetDone'), { action: { label: t('common.undo'), run: undo } });
  },
  'dismiss-outcome': () => {
    state.ui.outcome = null;
    notify();
  },
});

// ---------- Stage: status, notices, tray, inspector ----------

/** @param {View} v */
export function stageBarHTML(v) {
  const plan = v.doc.plan;
  const hard = v.validation?.hard.length ?? 0;
  const soft = v.validation?.soft.length ?? 0;
  const status = {
    none: ['seat', t('plan.status.none')],
    ok: ['check', t('plan.status.ok')],
    warnings: ['alert', t('plan.status.warnings', { count: soft })],
    incomplete: ['info', t('plan.status.incomplete', { count: v.unseated.length })],
    broken: ['alert', t('plan.status.broken', { count: hard })],
  }[v.status];
  const edited = plan?.generated && plan.edited;
  return `
    <div class="plan-status status-${v.status}" role="status">
      ${icon(status[0])}<span>${h(status[1])}</span>
      ${edited ? `<span class="tag">${h(t('plan.edited'))}</span>` : ''}
    </div>
    <div class="stage-actions">
      ${edited ? `<button type="button" class="btn btn-ghost btn-sm" data-action="reset-plan" title="${h(t('plan.resetHint'))}">${icon('reset')}<span>${h(t('plan.reset'))}</span></button>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-layout">${icon('grid')}<span>${h(t('layout.edit'))}</span></button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="print" ${plan ? '' : 'disabled'}>${icon('print')}<span>${h(t('export.print'))}</span></button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="export-csv" ${plan ? '' : 'disabled'}>${icon('download')}<span>${h(t('export.csv'))}</span></button>
    </div>`;
}

/** Result of the last generation, and problems in the current plan. @param {View} v */
export function noticesHTML(v) {
  let html = '';
  const outcome = state.ui.outcome;
  if (outcome && !outcome.ok) html += failureHTML(outcome.problem, v);
  else if (outcome?.ok && outcome.doc === v.doc) {
    const lines = [t(outcome.uniqueness === 'only-one' ? 'plan.onlyOne' : 'plan.generated')];
    if (outcome.unmet) lines.push(t('plan.unmetAfterGenerate', { count: outcome.unmet }));
    html += `<div class="notice notice-${outcome.uniqueness === 'only-one' ? 'info' : 'success'}" role="status">
      ${icon(outcome.uniqueness === 'only-one' ? 'info' : 'check')}
      <div class="notice-body"><p>${lines.map(h).join(' ')}</p></div>
      <button type="button" class="icon-btn" data-action="dismiss-outcome" aria-label="${h(t('common.dismiss'))}">${icon('x')}</button>
    </div>`;
  }
  const issues = [...(v.validation?.hard ?? []).map((i) => ['hard', i]), ...(v.validation?.soft ?? []).map((i) => ['soft', i])];
  if (issues.length) {
    const hard = v.validation.hard.length;
    html += `<details class="issues"${hard ? ' open' : ''}>
      <summary>${icon(hard ? 'alert' : 'info')}<span>${h(hard ? t('plan.issuesHard', { count: hard }) : t('plan.issuesSoft', { count: issues.length }))}</span></summary>
      ${hard ? `<p class="issues-hint">${h(t('plan.issuesHardHint'))}</p>` : ''}
      <ul>${issues.map(([kind, issue]) => `<li class="issue issue-${kind}">${icon(kind === 'hard' ? 'alert' : 'info')}<span>${issueReason(issue, v)}</span></li>`).join('')}</ul>
    </details>`;
  }
  return html;
}

/** @param {import('../engine.js').SeatingProblem} problem @param {View} v */
function failureHTML(problem, v) {
  const { title, paragraphs, ruleIds } = problemExplanation(problem, v);
  const rules = ruleIds.map((id) => v.doc.rules.find((r) => r.id === id)).filter(Boolean);
  const fixHint = problem.kind === 'not-enough-seats' ? t('explain.seatsFix') : rules.length ? t('explain.rulesFix') : '';
  return `<div class="notice notice-error" role="alert">
    ${icon('alert')}
    <div class="notice-body">
      <p class="notice-title">${title}</p>
      ${paragraphs.map((p) => `<p>${p}</p>`).join('')}
      ${
        rules.length
          ? `<ul class="notice-rules">${rules
              .map(
                (rule) => `<li>
                  <span class="rule-chip rule-${rule.strength}">${h(t(`rules.strength.${rule.strength}`))}</span>
                  <span class="notice-rule-text">${ruleSentence(rule, v)}</span>
                  <span class="notice-rule-actions">
                    <button type="button" class="btn btn-link btn-sm" data-action="rule-edit" data-id="${rule.id}">${h(t('common.edit'))}</button>
                    ${rule.strength === 'hard' && canBeSoft(rule) ? `<button type="button" class="btn btn-link btn-sm" data-action="rule-soften" data-id="${rule.id}">${h(t('rules.makePreference'))}</button>` : ''}
                    ${rule.active ? `<button type="button" class="btn btn-link btn-sm" data-action="rule-toggle" data-id="${rule.id}">${h(t('rules.turnOff'))}</button>` : ''}
                  </span>
                </li>`,
              )
              .join('')}</ul>`
          : ''
      }
      ${fixHint ? `<p class="notice-hint">${h(fixHint)}</p>` : ''}
    </div>
    <button type="button" class="icon-btn" data-action="dismiss-outcome" aria-label="${h(t('common.dismiss'))}">${icon('x')}</button>
  </div>`;
}

/** Students in the arrangement who have no seat yet. @param {View} v */
export function trayHTML(v) {
  if (!v.doc.plan || !v.unseated.length) return '';
  const selected = state.ui.selection?.studentId;
  return `<div class="tray" aria-label="${h(t('plan.unseatedTitle', { count: v.unseated.length }))}">
    <span class="tray-title">${h(t('plan.unseatedTitle', { count: v.unseated.length }))}</span>
    <div class="chips">
      ${v.unseated
        .map(
          (s) => `<button type="button" class="chip${selected === s.id ? ' is-selected' : ''}" data-action="select-student" data-drag="student" data-id="${s.id}" aria-pressed="${selected === s.id}">
            <span class="chip-name">${h(v.studentLabel(s.id))}</span></button>`,
        )
        .join('')}
    </div>
    <span class="tray-hint">${h(t('plan.unseatedHint'))}</span>
  </div>`;
}

/** One rule with its status in the current plan. @param {import('../model.js').Rule} rule @param {View} v */
export function ruleLineHTML(rule, v) {
  const status = v.ruleStatus(rule);
  return `<li class="rule-line rs-${status}">
    ${icon(STATUS_ICON[status])}
    <span>${ruleSentence(rule, v)}</span>
    <span class="sr-only">${h(t(`rules.status.${status}`))}</span>
  </li>`;
}

/** Details of the selected student or empty seat. @param {View} v */
export function inspectorHTML(v) {
  const sel = state.ui.selection;
  if (!sel) return '';
  if (sel.studentId) {
    const student = v.student(sel.studentId);
    if (!student) return '';
    const seat = v.seatOf.get(student.id);
    const name = v.studentLabel(student.id);
    const where = !student.included ? t('inspector.excluded') : seat ? t('inspector.seat', { seat: v.seatLabel(seat) }) : t('inspector.unseated');
    const rules = v.rulesOf(student.id);
    return `<section class="inspector" aria-label="${h(t('inspector.label'))}">
      <div class="inspector-head">
        <div><h3 class="inspector-title">${h(name)}</h3><p class="inspector-sub">${h(where)}</p></div>
        <button type="button" class="icon-btn" data-action="clear-selection" aria-label="${h(t('common.close'))}">${icon('x')}</button>
      </div>
      ${student.notes ? `<p class="inspector-notes">${h(student.notes)}</p>` : ''}
      ${student.included && v.doc.plan ? `<p class="hint">${h(t('inspector.moveHint', { name }))}</p>` : ''}
      ${rules.length ? `<ul class="rule-lines">${rules.map((r) => ruleLineHTML(r, v)).join('')}</ul>` : `<p class="muted">${h(t('inspector.noRules'))}</p>`}
      <div class="inspector-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-action="rule-new" data-student="${student.id}">${icon('plus')}<span>${h(t('inspector.addRule'))}</span></button>
        ${seat ? `<button type="button" class="btn btn-ghost btn-sm" data-action="unseat-student" data-id="${student.id}">${h(t('inspector.unseat'))}</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-included-btn" data-id="${student.id}">${h(t(student.included ? 'inspector.exclude' : 'inspector.include'))}</button>
      </div>
    </section>`;
  }
  const seatId = sel.seatId;
  if (!v.topo.seat(seatId)) return '';
  const rules = v.doc.rules.filter((r) => r.seatIds.includes(seatId));
  return `<section class="inspector" aria-label="${h(t('inspector.label'))}">
    <div class="inspector-head">
      <div><h3 class="inspector-title">${h(t('inspector.seatTitle', { seat: v.seatLabel(seatId) }))}</h3><p class="inspector-sub">${h(t('chart.empty'))}</p></div>
      <button type="button" class="icon-btn" data-action="clear-selection" aria-label="${h(t('common.close'))}">${icon('x')}</button>
    </div>
    <p class="hint">${h(t(v.doc.plan ? 'inspector.emptySeatHint' : 'inspector.noPlanHint'))}</p>
    ${rules.length ? `<ul class="rule-lines">${rules.map((r) => ruleLineHTML(r, v)).join('')}</ul>` : ''}
  </section>`;
}

// ---------- Saved arrangements ----------

/** @param {View} v */
export function savedPanelHTML(v) {
  const plan = v.doc.plan;
  const info = plan?.generated?.info;
  const saved = [...v.doc.saved].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `
    <section class="panel-section">
      <h3 class="section-title">${h(t('saved.current'))}</h3>
      ${
        plan
          ? `<p class="muted">${h(info ? t('saved.generatedAt', { date: formatDate(info.generatedAt) }) : t('saved.manual'))}${plan.edited && info ? ` · ${h(t('plan.edited'))}` : ''}</p>
             <form class="add-row" data-form="save-arrangement">
               <label class="sr-only" for="arrangement-name">${h(t('saved.nameLabel'))}</label>
               <input id="arrangement-name" name="name" maxlength="60" placeholder="${h(t('saved.namePlaceholder'))}" autocomplete="off">
               <button type="submit" class="btn btn-secondary">${icon('bookmark')}<span>${h(t('saved.save'))}</span></button>
             </form>`
          : `<p class="muted">${h(t('saved.noPlan'))}</p>`
      }
    </section>
    <section class="panel-section">
      <h3 class="section-title">${h(t('saved.title'))}</h3>
      ${
        saved.length
          ? `<ul class="saved-list">${saved
              .map(
                (s) => `<li class="saved-row">
                  <div><span class="saved-name">${h(s.name)}</span><span class="muted saved-date">${h(formatDate(s.createdAt))}</span></div>
                  <div class="row-buttons">
                    <button type="button" class="btn btn-ghost btn-sm" data-action="open-arrangement" data-id="${s.id}">${h(t('saved.open'))}</button>
                    <button type="button" class="icon-btn" data-action="delete-arrangement" data-id="${s.id}" aria-label="${h(t('saved.delete', { name: s.name }))}">${icon('trash')}</button>
                  </div>
                </li>`,
              )
              .join('')}</ul>`
          : `<p class="empty-hint">${h(t('saved.empty'))}</p>`
      }
    </section>
    <section class="panel-section">
      <h3 class="section-title">${h(t('export.title'))}</h3>
      <div class="button-stack">
        <button type="button" class="btn btn-secondary" data-action="print" ${plan ? '' : 'disabled'}>${icon('print')}<span>${h(t('export.printLong'))}</span></button>
        <button type="button" class="btn btn-secondary" data-action="export-csv" ${plan ? '' : 'disabled'}>${icon('download')}<span>${h(t('export.csvLong'))}</span></button>
        <button type="button" class="btn btn-secondary" data-action="export-backup">${icon('save')}<span>${h(t('export.backup'))}</span></button>
      </div>
    </section>`;
}

onSubmit({
  'save-arrangement': (data, form) => {
    const name = String(data.get('name') ?? '').trim() || t('saved.defaultName', { date: formatDate(new Date().toISOString()) });
    commit((d) => {
      d.saved.push({ id: newId(), name, createdAt: new Date().toISOString(), assignments: { ...d.plan.assignments } });
    });
    form.reset();
    toast(t('saved.savedToast', { name }), { kind: 'success' });
  },
});

onClick({
  'open-arrangement': async (el) => {
    const saved = state.doc.saved.find((s) => s.id === el.dataset.id);
    if (!saved) return;
    const plan = state.doc.plan;
    if (plan && !(await confirmDialog({ title: t('saved.openConfirmTitle', { name: h(saved.name) }), body: `<p>${h(t('saved.openConfirmBody'))}</p>`, confirm: t('saved.open'), danger: false }))) return;
    commit((d) => {
      d.plan = { id: newId(), createdAt: new Date().toISOString(), assignments: { ...saved.assignments }, generated: { assignments: { ...saved.assignments }, info: null }, edited: false };
    });
    state.ui.selection = null;
    toast(t('saved.opened', { name: saved.name }), { action: { label: t('common.undo'), run: undo } });
  },
  'delete-arrangement': async (el) => {
    const saved = state.doc.saved.find((s) => s.id === el.dataset.id);
    if (!saved) return;
    if (!(await confirmDialog({ title: t('saved.deleteConfirm', { name: h(saved.name) }), confirm: t('common.delete') }))) return;
    commit((d) => {
      d.saved = d.saved.filter((s) => s.id !== saved.id);
    });
  },
});
