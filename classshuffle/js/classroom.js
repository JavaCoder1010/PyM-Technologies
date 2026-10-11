// @ts-check
// Edits to a classroom document that keep it consistent: removing a seat or a
// student also cleans up the plan and the rules that pointed to it. Pure
// functions on plain data (they mutate the document they get), no DOM.

import { RULE_TYPES } from './constraints.js';
import { gridSeats } from './layout.js';
import { newId } from './model.js';

/** @typedef {import('./model.js').Classroom} Classroom */

/**
 * Moves a student to a seat. If someone sits there, they swap; if the moving
 * student had no seat, the other student is left without one.
 * @param {Record<string, string>} assignments
 * @returns {{ assignments: Record<string, string>, displaced: string | null }}
 */
export function placeStudent(assignments, studentId, seatId) {
  const next = { ...assignments };
  const from = next[studentId];
  const other = Object.keys(next).find((id) => next[id] === seatId && id !== studentId) ?? null;
  next[studentId] = seatId;
  let displaced = null;
  if (other) {
    if (from) next[other] = from;
    else {
      delete next[other];
      displaced = other;
    }
  }
  return { assignments: next, displaced };
}

/** Plan with no one seated (for placing students by hand before generating). */
export function emptyPlan() {
  return { id: newId(), createdAt: new Date().toISOString(), assignments: {}, generated: null, edited: true };
}

/** Rules that drop below their minimum of students or seats are removed. */
function pruneRules(doc) {
  const before = doc.rules.length;
  doc.rules = doc.rules.filter((rule) => {
    const def = RULE_TYPES[rule.type];
    if (!def) return true;
    if (rule.studentIds.length < def.students.min) return false;
    return !def.seats || rule.seatIds.length >= def.seats.min;
  });
  return before - doc.rules.length;
}

/**
 * @param {Classroom} doc
 * @param {string[]} ids
 * @returns {number} rules removed because they no longer had enough students
 */
export function removeStudents(doc, ids) {
  const gone = new Set(ids);
  doc.students = doc.students.filter((s) => !gone.has(s.id));
  for (const rule of doc.rules) rule.studentIds = rule.studentIds.filter((id) => !gone.has(id));
  const unassign = (assignments) => {
    for (const id of gone) delete assignments[id];
  };
  if (doc.plan) {
    unassign(doc.plan.assignments);
    if (doc.plan.generated) unassign(doc.plan.generated.assignments);
  }
  for (const saved of doc.saved) unassign(saved.assignments);
  return pruneRules(doc);
}

/**
 * What removing these seats would affect (to warn before doing it).
 * @param {Classroom} doc
 * @param {string[]} ids
 */
export function seatRemovalImpact(doc, ids) {
  const gone = new Set(ids);
  const seated = Object.values(doc.plan?.assignments ?? {}).filter((seat) => gone.has(seat)).length;
  const rules = doc.rules.filter((r) => r.seatIds.some((id) => gone.has(id))).length;
  return { seated, rules };
}

/**
 * @param {Classroom} doc
 * @param {string[]} ids
 * @returns {number} rules removed because they no longer had any seat
 */
export function removeSeats(doc, ids) {
  const gone = new Set(ids);
  doc.seats = doc.seats.filter((s) => !gone.has(s.id));
  for (const rule of doc.rules) rule.seatIds = rule.seatIds.filter((id) => !gone.has(id));
  const unassign = (assignments) => {
    for (const [student, seat] of Object.entries(assignments)) if (gone.has(seat)) delete assignments[student];
  };
  if (doc.plan) {
    unassign(doc.plan.assignments);
    if (doc.plan.generated) unassign(doc.plan.generated.assignments);
  }
  for (const saved of doc.saved) unassign(saved.assignments);
  return pruneRules(doc);
}

/** Excluding a student also takes them out of the current plan. */
export function setIncluded(doc, studentId, included) {
  const student = doc.students.find((s) => s.id === studentId);
  if (!student) return;
  student.included = included;
  if (!included && doc.plan) delete doc.plan.assignments[studentId];
}

/** A disabled seat can't be used, so whoever sat there is unseated. */
export function setSeatEnabled(doc, seatId, enabled) {
  const seat = doc.seats.find((s) => s.id === seatId);
  if (!seat) return;
  seat.enabled = enabled;
  if (!enabled && doc.plan) {
    for (const [student, id] of Object.entries(doc.plan.assignments)) if (id === seatId) delete doc.plan.assignments[student];
  }
}

/** Seats outside a grid of `rows` × `cols`. */
export const seatsOutside = (doc, rows, cols) => doc.seats.filter((s) => s.row >= rows || s.col >= cols).map((s) => s.id);

/** Resizes the grid, removing seats that fall outside it. Returns rules removed. */
export function resizeGrid(doc, rows, cols) {
  const removed = removeSeats(doc, seatsOutside(doc, rows, cols));
  doc.layout = { rows, cols };
  return removed;
}

/** Adds a row at the back with the same seat pattern as the current last row. */
export function addRowCopyingLast(doc) {
  const last = doc.layout.rows - 1;
  const pattern = doc.seats.filter((s) => s.row === last);
  doc.layout.rows += 1;
  for (const s of pattern) doc.seats.push({ id: newId(), row: last + 1, col: s.col, enabled: true, label: '' });
}

/**
 * Standard layout of desks; seats at unchanged positions keep their ids.
 * @param {Classroom} doc
 * @param {{ rows: number, desksPerRow: number, seatsPerDesk: number, aisles: boolean }} options
 * @returns {number} rules removed
 */
export function applyGridLayout(doc, options) {
  const grid = gridSeats(options, newId, doc.seats);
  const kept = new Set(grid.seats.map((s) => s.id));
  const removed = removeSeats(doc, doc.seats.filter((s) => !kept.has(s.id)).map((s) => s.id));
  doc.seats = grid.seats;
  doc.layout = { rows: grid.rows, cols: grid.cols };
  return removed;
}

/** Ids of the seats that would disappear with this standard layout. */
export function gridLayoutRemovals(doc, options) {
  const grid = gridSeats(options, () => '', doc.seats);
  const kept = new Set(grid.seats.map((s) => s.id));
  return doc.seats.filter((s) => !kept.has(s.id)).map((s) => s.id);
}
