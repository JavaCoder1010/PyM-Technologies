// @ts-check
// Independent check of a seating arrangement. It does not trust the engine: it
// re-checks every seat and every rule from scratch on the final arrangement.
// Used after generation, after every manual change and by the tests.

import { buildTopology } from './layout.js';
import { RULE_TYPES, HARD, effectiveRules } from './constraints.js';

/** @typedef {import('./model.js').Seat} Seat */
/** @typedef {import('./model.js').Student} Student */
/** @typedef {import('./model.js').Rule} Rule */
/** @typedef {import('./model.js').Adjacency} Adjacency */
/**
 * @typedef {{
 *   code: 'rule' | 'seat-missing' | 'seat-disabled' | 'seat-shared' | 'unseated' | 'excluded-seated',
 *   ruleId?: string, type?: string, penalty?: number,
 *   studentIds: string[], seatIds: string[]
 * }} Issue
 * @typedef {{ valid: boolean, hard: Issue[], soft: Issue[], notices: Issue[] }} Validation
 *   `hard`: broken hard rules and impossible seating (always errors).
 *   `soft`: unmet preferences (warnings). `notices`: students without a seat.
 */

/**
 * @param {{ seats: Seat[], students: Student[], rules: Rule[], adjacency?: Adjacency }} classroom
 * @param {Record<string, string>} assignments student id → seat id
 * @param {import('./layout.js').Topology} [topo]
 * @returns {Validation}
 */
export function validatePlan({ seats, students, rules, adjacency }, assignments, topo = buildTopology(seats, adjacency)) {
  /** @type {Issue[]} */ const hard = [];
  /** @type {Issue[]} */ const soft = [];
  /** @type {Issue[]} */ const notices = [];
  const known = new Set(students.map((s) => s.id));
  const included = new Set(students.filter((s) => s.included !== false).map((s) => s.id));

  /** @type {Map<string, string[]>} */
  const holders = new Map();
  for (const [studentId, seatId] of Object.entries(assignments ?? {})) {
    if (!known.has(studentId)) continue; // stale entry for a deleted student
    if (!included.has(studentId)) {
      notices.push({ code: 'excluded-seated', studentIds: [studentId], seatIds: [seatId] });
      continue;
    }
    if (!topo.seat(seatId)) {
      hard.push({ code: 'seat-missing', studentIds: [studentId], seatIds: [] });
      continue;
    }
    if (!topo.isUsable(seatId)) {
      hard.push({ code: 'seat-disabled', studentIds: [studentId], seatIds: [seatId] });
      continue;
    }
    holders.set(seatId, [...(holders.get(seatId) ?? []), studentId]);
  }
  for (const [seatId, ids] of holders) {
    if (ids.length > 1) hard.push({ code: 'seat-shared', studentIds: ids, seatIds: [seatId] });
  }
  for (const id of included) {
    if (!assignments?.[id]) notices.push({ code: 'unseated', studentIds: [id], seatIds: [] });
  }

  const seatOf = (id) => {
    const seat = included.has(id) ? assignments?.[id] : undefined;
    return seat && topo.isUsable(seat) ? seat : undefined;
  };
  const ctx = { topo, seatOf };
  for (const rule of effectiveRules(rules, included)) {
    const result = RULE_TYPES[rule.type].evaluate(rule, ctx);
    if (result.ok) continue;
    (rule.strength === HARD ? hard : soft).push({
      code: 'rule',
      ruleId: rule.id,
      type: rule.type,
      penalty: result.penalty,
      studentIds: result.studentIds,
      seatIds: result.seatIds,
    });
  }
  return { valid: hard.length === 0, hard, soft, notices };
}
