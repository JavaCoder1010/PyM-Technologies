// App state: the open classroom, undo/redo history, autosave and derived data
// (topology, labels, validation) that the views read.
//
// The classroom document is treated as immutable: every change goes through
// commit(), which edits a copy. Undo/redo just swap whole documents.
import * as repo from './repo.js';
import { buildTopology } from './layout.js';
import { validatePlan } from './validate.js';
import { studentLabels, duplicateIds } from './model.js';
import { RULE_TYPES } from './constraints.js';
import { debounce } from './util.js';

const HISTORY_LIMIT = 100;

export const state = {
  /** @type {import('./repo.js').ClassroomSummary[]} */
  index: [],
  /** @type {import('./model.js').Classroom | null} */
  doc: null,
  /** @type {import('./model.js').Classroom[]} */
  past: [],
  /** @type {import('./model.js').Classroom[]} */
  future: [],
  /** 'saved' | 'saving' | 'unsaved' | 'error' */
  save: 'saved',
  ui: {
    tab: 'students',
    /** @type {{ studentId?: string, seatId?: string } | null} */
    selection: null,
    editingLayout: false,
    generating: false,
    /** Result of the last generation, shown above the chart. */
    outcome: null,
    studentQuery: '',
  },
};

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
export const notify = () => listeners.forEach((fn) => fn());

// ---------- Changes and history ----------

/**
 * Applies `mutate` to a copy of the classroom. Return false from `mutate` to
 * cancel. Undoable unless `history` is false.
 * @param {(doc: import('./model.js').Classroom) => unknown} mutate
 */
export function commit(mutate, { history = true } = {}) {
  const before = state.doc;
  if (!before) return;
  const next = structuredClone(before);
  if (mutate(next) === false) return;
  next.updatedAt = new Date().toISOString();
  if (history) {
    state.past.push(before);
    if (state.past.length > HISTORY_LIMIT) state.past.shift();
    state.future = [];
  }
  state.doc = next;
  scheduleSave();
  notify();
}

export function undo() {
  if (!state.past.length) return false;
  state.future.push(state.doc);
  state.doc = state.past.pop();
  afterHistoryJump();
  return true;
}

export function redo() {
  if (!state.future.length) return false;
  state.past.push(state.doc);
  state.doc = state.future.pop();
  afterHistoryJump();
  return true;
}

function afterHistoryJump() {
  state.ui.selection = null;
  scheduleSave();
  notify();
}

// ---------- Saving ----------

const persist = debounce(async () => {
  const doc = state.doc;
  if (!doc) return;
  state.save = 'saving';
  notify();
  try {
    await repo.saveClassroom(doc);
    state.index = await repo.listClassrooms();
    state.save = state.doc === doc ? 'saved' : 'unsaved';
  } catch (err) {
    console.error(err);
    state.save = 'error';
  }
  notify();
}, 400);

function scheduleSave() {
  state.save = 'unsaved';
  persist();
}

/** Saves right away (before switching classrooms or leaving the page). */
export const flushSave = () => (state.save === 'unsaved' ? persist.flush() : undefined);

// ---------- Opening classrooms ----------

export async function loadIndex() {
  state.index = await repo.listClassrooms();
}

export async function openClassroom(id) {
  await flushSave();
  const doc = await repo.loadClassroom(id);
  if (!doc) return false;
  setDoc(doc);
  return true;
}

/** Opens a new document and saves it. */
export async function openNew(doc) {
  await flushSave();
  setDoc(doc);
  await repo.saveClassroom(doc);
  state.index = await repo.listClassrooms();
  notify();
}

function setDoc(doc) {
  state.doc = doc;
  state.past = [];
  state.future = [];
  state.save = 'saved';
  state.ui = { ...state.ui, selection: null, editingLayout: false, outcome: null, studentQuery: '' };
  if (doc) repo.rememberOpened(doc.id);
  notify();
}

export async function deleteClassroom(id) {
  await repo.deleteClassroom(id);
  state.index = await repo.listClassrooms();
  if (state.doc?.id === id) setDoc(null);
  notify();
}

// ---------- Derived data ----------

let cache = { doc: null, view: null, topo: null, seats: null, adjacency: null };

/** Everything the views need about the open classroom, computed once per change. */
export function view() {
  const doc = state.doc;
  if (cache.doc === doc && cache.view) return cache.view;
  if (cache.seats !== doc.seats || cache.adjacency !== doc.adjacency) {
    cache.topo = buildTopology(doc.seats, doc.adjacency);
    cache.seats = doc.seats;
    cache.adjacency = doc.adjacency;
  }
  const topo = cache.topo;
  const studentsById = new Map(doc.students.map((s) => [s.id, s]));
  const labels = studentLabels(doc.students);
  const assignments = doc.plan?.assignments ?? {};

  /** @type {Map<string, string>} seat → student */
  const occupant = new Map();
  /** @type {Map<string, string>} student → seat */
  const seatOf = new Map();
  for (const [studentId, seatId] of Object.entries(assignments)) {
    const student = studentsById.get(studentId);
    if (!student?.included || !topo.seat(seatId)) continue;
    occupant.set(seatId, studentId);
    seatOf.set(studentId, seatId);
  }

  const validation = doc.plan ? validatePlan(doc, assignments, topo) : null;
  /** @type {Map<string, import('./validate.js').Issue>} */
  const ruleIssue = new Map();
  for (const issue of [...(validation?.hard ?? []), ...(validation?.soft ?? [])]) if (issue.ruleId) ruleIssue.set(issue.ruleId, issue);
  const brokenStudents = new Set(validation?.hard.flatMap((i) => i.studentIds));
  const brokenSeats = new Set(validation?.hard.flatMap((i) => i.seatIds));
  const unmetStudents = new Set(validation?.soft.flatMap((i) => i.studentIds));

  /** @type {Map<string, import('./model.js').Rule[]>} */
  const rulesOf = new Map();
  /** @type {Map<string, string>} student → fixed seat */
  const fixedSeat = new Map();
  for (const rule of doc.rules) {
    for (const id of rule.studentIds) rulesOf.set(id, [...(rulesOf.get(id) ?? []), rule]);
    if (rule.type === 'fixed' && rule.active) fixedSeat.set(rule.studentIds[0], rule.seatIds[0]);
  }

  const included = doc.students.filter((s) => s.included);
  const unseated = included.filter((s) => !seatOf.has(s.id));
  const hardCount = validation?.hard.length ?? 0;
  const softCount = validation?.soft.length ?? 0;
  const status = !doc.plan ? 'none' : hardCount ? 'broken' : unseated.length ? 'incomplete' : softCount ? 'warnings' : 'ok';

  const result = {
    doc,
    topo,
    seatLabel: (id) => topo.label(id),
    studentLabel: (id) => labels.get(id) ?? '?',
    student: (id) => studentsById.get(id),
    duplicates: duplicateIds(doc.students),
    occupant,
    seatOf,
    validation,
    ruleIssue,
    brokenStudents,
    brokenSeats,
    unmetStudents,
    rulesOf: (id) => rulesOf.get(id) ?? [],
    fixedSeat,
    includedCount: included.length,
    unseated,
    usableSeats: topo.usableIds.length,
    status,
    /** Rule status in the current plan: ok | broken | unmet | off | na (students excluded) | none (no plan). */
    ruleStatus(rule) {
      if (!rule.active) return 'off';
      const def = RULE_TYPES[rule.type];
      const present = rule.studentIds.filter((id) => studentsById.get(id)?.included).length;
      if (!def || present < def.students.min) return 'na';
      if (!doc.plan) return 'none';
      const issue = ruleIssue.get(rule.id);
      if (!issue) return 'ok';
      return validation.hard.includes(issue) ? 'broken' : 'unmet';
    },
  };
  cache.doc = doc;
  cache.view = result;
  return result;
}

/** @typedef {ReturnType<typeof view>} View */
