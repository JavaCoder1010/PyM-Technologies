// @ts-check
// Data model: the shape of a saved classroom and functions that create its parts.
// Everything a teacher builds for one class lives in a single Classroom document
// (layout, students, rules, current plan, saved arrangements), so it can be
// saved, exported and undone as a unit.

import { gridSeats, DEFAULT_ADJACENCY } from './layout.js';

/**
 * @typedef {{ id: string, row: number, col: number, enabled: boolean, label: string }} Seat
 *   A seat on the floor-plan grid. Row 0 is the front (nearest the board).
 * @typedef {{ frontBack: boolean, diagonal: boolean }} Adjacency
 *   Which seats count as "next to" each other besides left/right in the same row.
 * @typedef {{ id: string, name: string, notes: string, included: boolean, createdAt: string }} Student
 *   `included: false` keeps the student on the list but out of the arrangement.
 * @typedef {'hard' | 'soft'} Strength
 * @typedef {{
 *   id: string, type: string, studentIds: string[], seatIds: string[],
 *   strength: Strength, importance: 'normal' | 'high', params: Record<string, number>,
 *   active: boolean, createdAt: string
 * }} Rule
 * @typedef {{ seed: number, generatedAt: string, uniqueness: string, attempts: number, nodes: number, ms: number }} GenerationInfo
 * @typedef {{
 *   id: string, createdAt: string, assignments: Record<string, string>,
 *   generated: { assignments: Record<string, string>, info: GenerationInfo } | null,
 *   edited: boolean
 * }} SeatingPlan
 *   `assignments` maps student id → seat id. `generated` is the last version the
 *   engine produced, kept so manual changes can be reset.
 * @typedef {{ id: string, name: string, createdAt: string, assignments: Record<string, string> }} SavedArrangement
 * @typedef {{
 *   schemaVersion: number, id: string, name: string, demo?: boolean,
 *   createdAt: string, updatedAt: string,
 *   layout: { rows: number, cols: number }, adjacency: Adjacency,
 *   seats: Seat[], students: Student[], rules: Rule[],
 *   plan: SeatingPlan | null, saved: SavedArrangement[]
 * }} Classroom
 */

export const SCHEMA_VERSION = 1;

/** Random unique id (RFC 4122 v4). */
export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const now = () => new Date().toISOString();

/**
 * @param {{ name: string, rows?: number, desksPerRow?: number, seatsPerDesk?: number, aisles?: boolean }} options
 * @returns {Classroom}
 */
export function createClassroom({ name, rows = 5, desksPerRow = 3, seatsPerDesk = 2, aisles = true }) {
  const grid = gridSeats({ rows, desksPerRow, seatsPerDesk, aisles }, newId);
  const stamp = now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name: name.trim(),
    createdAt: stamp,
    updatedAt: stamp,
    layout: { rows: grid.rows, cols: grid.cols },
    adjacency: { ...DEFAULT_ADJACENCY },
    seats: grid.seats,
    students: [],
    rules: [],
    plan: null,
    saved: [],
  };
}

/** @returns {Student} */
export function createStudent(name, notes = '') {
  return { id: newId(), name: name.trim(), notes, included: true, createdAt: now() };
}

/**
 * @param {string} type
 * @param {Partial<Rule>} fields
 * @returns {Rule}
 */
export function createRule(type, fields = {}) {
  return {
    id: newId(),
    type,
    studentIds: [],
    seatIds: [],
    strength: 'hard',
    importance: 'normal',
    params: {},
    active: true,
    createdAt: now(),
    ...fields,
  };
}

/**
 * Names from pasted text: one per line. Ignores blank lines, list bullets and
 * numbering ("1.", "2)", "-", "•") and extra spaces.
 * @param {string} text
 */
export function parseNames(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Key used to spot duplicate names: case, accents and spacing are ignored. */
export const nameKey = (name) =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * Display labels that tell duplicate names apart ("Sam K." and "Sam K. (2)").
 * Students are always identified by id; this is only for showing them.
 * @param {Student[]} students
 * @returns {Map<string, string>}
 */
export function studentLabels(students) {
  const seen = new Map();
  const labels = new Map();
  for (const s of students) {
    const key = nameKey(s.name);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    labels.set(s.id, n > 1 ? `${s.name} (${n})` : s.name);
  }
  return labels;
}

/** Ids of students whose name appears more than once. */
export function duplicateIds(students) {
  const groups = new Map();
  for (const s of students) {
    const key = nameKey(s.name);
    groups.set(key, [...(groups.get(key) ?? []), s.id]);
  }
  return new Set([...groups.values()].filter((ids) => ids.length > 1).flat());
}

/**
 * Brings a saved document up to the current schema, filling anything missing.
 * @param {any} doc
 * @returns {Classroom}
 */
export function migrate(doc) {
  return {
    ...doc,
    schemaVersion: SCHEMA_VERSION,
    adjacency: { ...DEFAULT_ADJACENCY, ...doc.adjacency },
    seats: doc.seats ?? [],
    students: (doc.students ?? []).map((s) => ({ notes: '', included: true, ...s })),
    rules: (doc.rules ?? []).map((r) => ({ seatIds: [], params: {}, importance: 'normal', active: true, ...r })),
    plan: doc.plan ?? null,
    saved: doc.saved ?? [],
  };
}
