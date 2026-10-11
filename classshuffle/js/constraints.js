// @ts-check
// Seating rules: what each rule type means and how it is checked.
//
// Each rule is "hard" (must never be broken) or "soft" (a preference that is
// met whenever possible). Some types only allow one of the two: a fixed seat is
// always hard, a preferred seat always soft.
//
// Adding a rule type: add an entry to RULE_TYPES with `evaluate`, which judges
// the rule on an arrangement. That alone is enough for the engine and the
// validator. Two optional hooks make the search faster:
//   - `allowedSeats(rule, topo)`: for rules about each student's own seat
//     (applied up front to narrow the seats each student can take);
//   - `compatible(rule, seatA, seatB, topo)`: for rules about pairs of students
//     (prunes seats as soon as one of them is seated).
// The interface also needs texts for the type in js/i18n/en.js (rules.*).

import { componentCount } from './layout.js';

/** @typedef {import('./model.js').Rule} Rule */
/** @typedef {import('./layout.js').Topology} Topology */
/**
 * @typedef {{ topo: Topology, seatOf: (studentId: string) => string | undefined }} EvalContext
 * @typedef {{ ok: boolean, penalty: number, studentIds: string[], seatIds: string[] }} Evaluation
 *   `penalty` measures how badly the rule is broken (0 when ok); `studentIds` and
 *   `seatIds` point at what breaks it.
 * @typedef {{
 *   students: { min: number, max: number },
 *   seats: { min: number, max: number } | null,
 *   params?: Record<string, { min: number, max: number, default: number }>,
 *   strengths: ('hard' | 'soft')[],
 *   defaultStrength: 'hard' | 'soft',
 *   evaluate: (rule: Rule, ctx: EvalContext) => Evaluation,
 *   allowedSeats?: (rule: Rule, topo: Topology) => Set<string>,
 *   compatible?: (rule: Rule, seatA: string, seatB: string, topo: Topology) => boolean,
 * }} RuleType
 */

export const HARD = 'hard';
export const SOFT = 'soft';

/** How much an unmet preference weighs when comparing arrangements. */
export const IMPORTANCE_WEIGHT = { normal: 1, high: 3 };
export const ruleWeight = (rule) => IMPORTANCE_WEIGHT[rule.importance] ?? 1;

/** @type {WeakMap<object, { topo: Topology, seats: Set<string> }>} */
const allowedCache = new WeakMap();

/**
 * Rule about each listed student's own seat. `unseatedOk`: a student without a
 * seat does not break it (e.g. "avoid these seats").
 * @param {(rule: Rule, topo: Topology) => Set<string>} allowed
 * @param {{ unseatedOk?: boolean }} [options]
 */
function seatRule(allowed, { unseatedOk = false } = {}) {
  /** @param {Rule} rule @param {Topology} topo */
  const allowedSeats = (rule, topo) => {
    let cached = allowedCache.get(rule);
    if (!cached || cached.topo !== topo) {
      cached = { topo, seats: allowed(rule, topo) };
      allowedCache.set(rule, cached);
    }
    return cached.seats;
  };
  return {
    allowedSeats,
    /** @param {Rule} rule @param {EvalContext} ctx */
    evaluate(rule, ctx) {
      const ok = allowedSeats(rule, ctx.topo);
      const bad = rule.studentIds.filter((id) => {
        const seat = ctx.seatOf(id);
        return seat ? !ok.has(seat) : !unseatedOk;
      });
      return { ok: bad.length === 0, penalty: bad.length, studentIds: bad, seatIds: bad.map(ctx.seatOf).filter(Boolean) };
    },
  };
}

const rowsParam = { rows: { min: 1, max: 20, default: 2 } };
const rows = (rule) => Math.max(1, Number(rule.params?.rows) || rowsParam.rows.default);

/** @type {Record<string, RuleType>} */
export const RULE_TYPES = {
  // None of these students sit next to each other.
  apart: {
    students: { min: 2, max: 8 },
    seats: null,
    strengths: [HARD, SOFT],
    defaultStrength: HARD,
    compatible: (rule, a, b, topo) => !topo.adjacent(a, b),
    evaluate(rule, { topo, seatOf }) {
      const seated = rule.studentIds.filter(seatOf);
      const bad = new Set();
      let pairs = 0;
      for (let i = 0; i < seated.length; i++) {
        for (let j = i + 1; j < seated.length; j++) {
          if (!topo.adjacent(seatOf(seated[i]), seatOf(seated[j]))) continue;
          pairs++;
          bad.add(seated[i]).add(seated[j]);
        }
      }
      return { ok: pairs === 0, penalty: pairs, studentIds: [...bad], seatIds: [...bad].map(seatOf) };
    },
  },

  // These students sit together: their seats form one connected group.
  together: {
    students: { min: 2, max: 6 },
    seats: null,
    strengths: [HARD, SOFT],
    defaultStrength: HARD,
    // A connected group of k seats spans at most k − 1 steps.
    compatible: (rule, a, b, topo) => topo.distance(a, b) <= rule.studentIds.length - 1,
    evaluate(rule, { topo, seatOf }) {
      const seats = rule.studentIds.map(seatOf).filter(Boolean);
      const missing = rule.studentIds.length - seats.length;
      const penalty = missing + Math.max(0, componentCount(topo, seats) - 1);
      return { ok: penalty === 0, penalty, studentIds: penalty ? [...rule.studentIds] : [], seatIds: penalty ? seats : [] };
    },
  },

  fixed: {
    students: { min: 1, max: 1 },
    seats: { min: 1, max: 1 },
    strengths: [HARD],
    defaultStrength: HARD,
    ...seatRule((rule, topo) => new Set(rule.seatIds.filter(topo.isUsable))),
  },

  preferred: {
    students: { min: 1, max: 1 },
    seats: { min: 1, max: 12 },
    strengths: [SOFT],
    defaultStrength: SOFT,
    ...seatRule((rule, topo) => new Set(rule.seatIds.filter(topo.isUsable))),
  },

  front: {
    students: { min: 1, max: 40 },
    seats: null,
    params: rowsParam,
    strengths: [HARD, SOFT],
    defaultStrength: HARD,
    ...seatRule((rule, topo) => new Set(topo.usableIds.filter((id) => topo.inFrontRows(id, rows(rule))))),
  },

  back: {
    students: { min: 1, max: 40 },
    seats: null,
    params: rowsParam,
    strengths: [HARD, SOFT],
    defaultStrength: SOFT,
    ...seatRule((rule, topo) => new Set(topo.usableIds.filter((id) => topo.inBackRows(id, rows(rule))))),
  },

  avoid: {
    students: { min: 1, max: 40 },
    seats: { min: 1, max: 200 },
    strengths: [HARD, SOFT],
    defaultStrength: HARD,
    ...seatRule(
      (rule, topo) => {
        const avoided = new Set(rule.seatIds);
        return new Set(topo.usableIds.filter((id) => !avoided.has(id)));
      },
      { unseatedOk: true },
    ),
  },
};

/** Rule types in the order the interface offers them. */
export const RULE_TYPE_ORDER = ['apart', 'together', 'fixed', 'preferred', 'front', 'back', 'avoid'];

/**
 * The rules that apply to an arrangement of `includedIds`: turned-off rules
 * and unknown types are dropped, excluded students are taken out of each rule,
 * and a rule left with too few students no longer applies.
 * @param {Rule[]} rules
 * @param {Set<string>} includedIds
 * @returns {Rule[]}
 */
export function effectiveRules(rules, includedIds) {
  const out = [];
  for (const rule of rules) {
    const def = RULE_TYPES[rule.type];
    if (!def || rule.active === false) continue;
    const studentIds = rule.studentIds.filter((id) => includedIds.has(id));
    if (studentIds.length < def.students.min) continue;
    const strength = def.strengths.includes(rule.strength) ? rule.strength : def.defaultStrength;
    out.push({ ...rule, studentIds, strength });
  }
  return out;
}

/**
 * What is missing for a rule to be complete (for the rule editor).
 * @param {Rule} rule
 * @returns {null | 'students' | 'seats'}
 */
export function incompleteField(rule) {
  const def = RULE_TYPES[rule.type];
  const n = new Set(rule.studentIds).size;
  if (n < def.students.min || n > def.students.max) return 'students';
  if (def.seats && (rule.seatIds.length < def.seats.min || rule.seatIds.length > def.seats.max)) return 'seats';
  return null;
}

/** Whether the rule's type allows it to be a preference. */
export const canBeSoft = (rule) => RULE_TYPES[rule.type]?.strengths.includes(SOFT) ?? false;
