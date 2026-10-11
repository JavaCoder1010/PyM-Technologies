// Turns rules, validation issues and engine failures into plain-language text.
import { t, list } from '../i18n.js';
import { h } from '../util.js';

/** @typedef {import('../store.js').View} View */

const MAX_SEATS_SHOWN = 6;

/** Icon for a rule's status in the current plan (see view().ruleStatus). */
export const STATUS_ICON = { ok: 'check', broken: 'alert', unmet: 'info', off: 'pause', na: 'pause', none: 'dot' };

/** "Alex and Sam" (names escaped and bolded). */
export const namesHTML = (ids, v) => list(ids.map((id) => `<strong>${h(v.studentLabel(id))}</strong>`));

/** "B1, B2 and 4 more". */
export function seatsHTML(ids, v) {
  const labels = ids.map((id) => `<strong>${h(v.seatLabel(id))}</strong>`);
  if (labels.length <= MAX_SEATS_SHOWN) return list(labels);
  return list([...labels.slice(0, MAX_SEATS_SHOWN - 1), t('common.more', { count: labels.length - MAX_SEATS_SHOWN + 1 })]);
}

/**
 * The rule as a sentence, e.g. "Alex and Sam must never sit next to each other."
 * @param {import('../model.js').Rule} rule
 * @param {View} v
 */
export function ruleSentence(rule, v) {
  const students = rule.studentIds.filter((id) => v.student(id));
  return t(`rules.sentence.${rule.type}.${rule.strength}`, {
    names: students.length ? namesHTML(students, v) : t('rules.nobody'),
    seats: rule.seatIds.length ? seatsHTML(rule.seatIds, v) : t('rules.noSeats'),
    rows: rule.params?.rows ?? 2,
    count: rule.seatIds.length,
  });
}

/**
 * Why an issue is a problem, e.g. "Alex and Sam sit next to each other (B1, B2)."
 * @param {import('../validate.js').Issue} issue
 * @param {View} v
 */
export function issueReason(issue, v) {
  const names = namesHTML(issue.studentIds, v);
  const seats = issue.seatIds.length ? seatsHTML(issue.seatIds, v) : '';
  if (issue.code !== 'rule') return t(`issues.${issue.code}`, { names, seats });
  const rule = v.doc.rules.find((r) => r.id === issue.ruleId);
  return t(`issues.${issue.type}`, {
    names,
    seats,
    count: issue.studentIds.length,
    target: rule?.seatIds.length ? seatsHTML(rule.seatIds, v) : '',
    rows: rule?.params?.rows ?? 2,
  });
}

/**
 * Explanation of why no plan could be generated: a title, paragraphs and the
 * rules involved (so the interface can offer to change them).
 * @param {import('../engine.js').SeatingProblem} problem
 * @param {View} v
 * @returns {{ title: string, paragraphs: string[], ruleIds: string[] }}
 */
export function problemExplanation(problem, v) {
  const ruleIds = 'ruleIds' in problem ? problem.ruleIds.filter((id) => v.doc.rules.some((r) => r.id === id)) : [];
  const p = (key, params) => t(`explain.${key}`, params);
  switch (problem.kind) {
    case 'no-students':
      return { title: p('noStudentsTitle'), paragraphs: [p('noStudents')], ruleIds };
    case 'not-enough-seats':
      return {
        title: p('seatsTitle'),
        paragraphs: [p('seats', { students: problem.students, seats: problem.seats, missing: problem.students - problem.seats })],
        ruleIds,
      };
    case 'no-seat': {
      const name = namesHTML([problem.studentId], v);
      const rules = ruleIds.map((id) => v.doc.rules.find((r) => r.id === id));
      const fixed = rules.length === 1 && rules[0].type === 'fixed' ? rules[0] : null;
      if (fixed) {
        const seat = fixed.seatIds[0];
        const why = v.topo.seat(seat) ? p('seatDisabled') : p('seatRemoved');
        return { title: p('noSeatTitle', { name }), paragraphs: [p('fixedUnavailable', { name, seat: seatsHTML([seat], v), why })], ruleIds };
      }
      return { title: p('noSeatTitle', { name }), paragraphs: [p('noSeat', { name, count: ruleIds.length })], ruleIds };
    }
    case 'crowded':
      return {
        title: p('crowdedTitle'),
        paragraphs: [
          p('crowded', { names: namesHTML(problem.studentIds, v), count: problem.seatIds.length, seats: seatsHTML(problem.seatIds, v) }),
        ],
        ruleIds,
      };
    case 'conflict':
      return { title: p('conflictTitle'), paragraphs: [p(ruleIds.length === 1 ? 'conflictOne' : 'conflict', { count: ruleIds.length })], ruleIds };
    case 'limit':
      return { title: p('limitTitle'), paragraphs: [p('limit'), ruleIds.length ? p('limitRules') : ''].filter(Boolean), ruleIds };
    default:
      return { title: p('internalTitle'), paragraphs: [p('internal')], ruleIds };
  }
}
