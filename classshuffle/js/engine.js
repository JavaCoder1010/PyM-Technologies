// @ts-check
// Seating assignment engine. Pure module (no DOM), tested on its own.
//
// How a plan is generated:
// 1. Every student starts with all usable seats as options. Hard rules about a
//    student's own seat (fixed seat, front/back rows, avoided seats) narrow
//    those options up front.
// 2. Quick feasibility checks with specific explanations: enough seats, no
//    student left without options, and no group of students squeezed into
//    fewer seats than they need (found with a bipartite matching).
// 3. Backtracking search. It always seats next the student with the fewest
//    options left (minimum remaining values; ties broken at random) and tries
//    that student's seats in random order. After each choice, seats that would
//    break a hard rule are removed from the other students' options (forward
//    checking); if someone runs out, it backtracks. A search budget stops
//    runaway cases.
// 4. Improvement: random moves and swaps that keep every hard rule are kept
//    when they meet more preferences (simulated annealing). A small pull away
//    from the previous arrangement makes successive plans differ.
// 5. The result is re-checked with the independent validator before returning.
//
// If the search proves no arrangement exists, the engine looks for a smallest
// set of rules that conflict (dropping rules one at a time while the problem
// stays impossible) so the teacher knows which rules to change.
//
// Randomness is seeded, so a plan can be reproduced. The search explores valid
// arrangements in random order; it does not claim a uniform distribution.

import { buildTopology } from './layout.js';
import { RULE_TYPES, HARD, SOFT, effectiveRules, ruleWeight } from './constraints.js';
import { validatePlan } from './validate.js';
import { createRng, randomSeed } from './rng.js';

/** @typedef {import('./model.js').Seat} Seat */
/** @typedef {import('./model.js').Student} Student */
/** @typedef {import('./model.js').Rule} Rule */
/** @typedef {import('./model.js').Adjacency} Adjacency */
/** @typedef {import('./validate.js').Issue} Issue */
/**
 * @typedef {{
 *   seats: Seat[], students: Student[], rules: Rule[], adjacency?: Adjacency,
 *   previous?: Record<string, string> | null
 * }} SeatingInput
 *   `previous`: the current arrangement, so a new one can differ from it.
 * @typedef {{
 *   seed?: number, maxNodes?: number, attempts?: number,
 *   improveSteps?: number, explainNodes?: number
 * }} SeatingOptions
 * @typedef {(
 *   { kind: 'no-students' } |
 *   { kind: 'not-enough-seats', students: number, seats: number } |
 *   { kind: 'no-seat', studentId: string, ruleIds: string[] } |
 *   { kind: 'crowded', studentIds: string[], seatIds: string[], ruleIds: string[] } |
 *   { kind: 'conflict', ruleIds: string[] } |
 *   { kind: 'limit', ruleIds: string[] } |
 *   { kind: 'internal', issues: Issue[] }
 * )} SeatingProblem
 * @typedef {{ nodes: number, attempts: number, ms: number }} SeatingStats
 * @typedef {(
 *   { ok: true, seed: number, stats: SeatingStats, assignments: Record<string, string>,
 *     uniqueness: 'new' | 'different' | 'only-one', unmet: Issue[], penalty: number } |
 *   { ok: false, seed: number, stats: SeatingStats, problem: SeatingProblem }
 * )} SeatingResult
 *   uniqueness: 'new' (no previous plan), 'different' (differs from the previous
 *   one) or 'only-one' (the search proved the previous plan is the only one).
 */

/** @type {Readonly<{ maxNodes: number, attempts: number, improveSteps: number, explainNodes: number }>} */
export const DEFAULT_OPTIONS = Object.freeze({
  maxNodes: 50000, // search steps per attempt
  attempts: 3, // independent randomized searches; the best is kept
  improveSteps: 0, // improvement moves per attempt (0 = based on class size)
  explainNodes: 10000, // search steps per check when looking for conflicting rules
});

/** Weight of "same seat as last time" per student; below any preference. */
const VARIATION_WEIGHT = 0.1;

/**
 * @param {SeatingInput} input
 * @param {SeatingOptions} [options]
 * @returns {SeatingResult}
 */
export function generateSeating(input, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const seed = options.seed ?? randomSeed();
  const rng = createRng(seed);
  const started = Date.now();
  const stats = { nodes: 0, attempts: 0, ms: 0 };
  const finish = (result) => ({ seed, ...result, stats: { ...stats, ms: Date.now() - started } });

  const problem = buildProblem(input);
  const blocked = precheck(problem);
  if (blocked) return finish({ ok: false, problem: blocked });
  const conflict = () => finish({ ok: false, problem: { kind: 'conflict', ruleIds: explainConflict(problem, opts) ?? problem.hard.map((r) => r.id) } });
  if (!narrowByRules(problem)) return conflict();

  const previous = input.previous && Object.keys(input.previous).length ? new Map(Object.entries(input.previous)) : null;
  /** @type {Map<string, number>} */
  const conflicts = new Map();
  let best = null;
  let onlyPrevious = false;
  let exhausted = false;

  for (let i = 0; i < opts.attempts; i++) {
    stats.attempts++;
    const found = search(problem, rng, opts.maxNodes, previous, conflicts);
    stats.nodes += found.nodes;
    if (found.status === 'limit') continue; // a fresh random order often succeeds
    if (found.status === 'exhausted') {
      exhausted = true;
      onlyPrevious = found.rejectedPrevious;
      break;
    }
    const candidate = improve(problem, found.assignment, rng, previous, opts.improveSteps);
    if (!best || isBetter(candidate, best)) best = candidate;
    if (best.penalty === 0 && best.variation === 0) break;
  }

  let uniqueness = previous ? 'different' : 'new';
  if (!best && onlyPrevious) {
    // Every valid arrangement is the previous one: say so instead of pretending.
    best = { assignment: new Map(problem.studentIds.map((id) => [id, previous.get(id)])), penalty: 0, variation: 0 };
    uniqueness = 'only-one';
  }
  if (!best && exhausted) return conflict();
  if (!best) {
    // Out of budget: still try to prove which rules conflict; otherwise name the usual suspects.
    const ruleIds = explainConflict(problem, opts);
    return finish({ ok: false, problem: ruleIds ? { kind: 'conflict', ruleIds } : { kind: 'limit', ruleIds: mostConflicting(conflicts) } });
  }

  const assignments = Object.fromEntries(best.assignment);
  const check = validatePlan(input, assignments, problem.topo);
  if (!check.valid) return finish({ ok: false, problem: { kind: 'internal', issues: check.hard } });
  const penalty = check.soft.reduce((sum, issue) => sum + (issue.penalty ?? 1), 0);
  return finish({ ok: true, assignments, uniqueness, unmet: check.soft, penalty });
}

/**
 * Normalized problem: included students, usable seats, each student's seat
 * options after one-seat rules, and the rules that relate students.
 * @param {SeatingInput} input
 */
export function buildProblem({ seats, students, rules, adjacency }) {
  const topo = buildTopology(seats, adjacency);
  const studentIds = students.filter((s) => s.included !== false).map((s) => s.id);
  const active = effectiveRules(rules, new Set(studentIds));
  return makeProblem(
    topo,
    studentIds,
    active.filter((r) => r.strength === HARD),
    active.filter((r) => r.strength === SOFT),
  );
}

/**
 * @param {import('./layout.js').Topology} topo
 * @param {string[]} studentIds
 * @param {Rule[]} hard effective hard rules
 * @param {Rule[]} soft effective soft rules
 */
function makeProblem(topo, studentIds, hard, soft) {
  /** @type {Map<string, Set<string>>} seat options per student */
  const domains = new Map(studentIds.map((id) => [id, new Set(topo.usableIds)]));
  /** @type {Map<string, Rule[]>} one-seat hard rules that narrowed each student's options */
  const restrictedBy = new Map(studentIds.map((id) => [id, []]));
  /** @type {Map<string, Rule[]>} hard rules that relate a student to others */
  const hardOf = new Map(studentIds.map((id) => [id, []]));
  /** @type {Map<string, Rule[]>} */
  const softOf = new Map(studentIds.map((id) => [id, []]));

  for (const rule of hard) {
    const def = RULE_TYPES[rule.type];
    if (def.allowedSeats) {
      const allowed = def.allowedSeats(rule, topo);
      for (const id of rule.studentIds) {
        const domain = domains.get(id);
        for (const seat of [...domain]) if (!allowed.has(seat)) domain.delete(seat);
        restrictedBy.get(id).push(rule);
      }
    } else {
      for (const id of rule.studentIds) hardOf.get(id).push(rule);
    }
  }
  for (const rule of soft) for (const id of rule.studentIds) softOf.get(id).push(rule);

  return { topo, studentIds, hard, soft, domains, restrictedBy, hardOf, softOf };
}

/** @typedef {ReturnType<typeof buildProblem>} Problem */
/** @typedef {Pick<Problem, 'topo' | 'studentIds' | 'domains' | 'hardOf'>} SearchProblem the part of a problem the search needs */

/**
 * Cheap checks that explain the most common impossible setups precisely.
 * @param {Problem} problem
 * @returns {SeatingProblem | null}
 */
function precheck(problem) {
  const { topo, studentIds, domains, restrictedBy } = problem;
  if (!studentIds.length) return { kind: 'no-students' };
  if (studentIds.length > topo.usableIds.length) {
    return { kind: 'not-enough-seats', students: studentIds.length, seats: topo.usableIds.length };
  }
  for (const id of studentIds) {
    if (domains.get(id).size === 0) return { kind: 'no-seat', studentId: id, ruleIds: rulesLeavingNoSeat(restrictedBy.get(id), topo) };
  }
  return crowdedGroup(problem);
}

/** Smallest subset of a student's one-seat rules that still rules out every seat. */
function rulesLeavingNoSeat(rules, topo) {
  const excludesAll = (list) => topo.usableIds.every((seat) => list.some((r) => !RULE_TYPES[r.type].allowedSeats(r, topo).has(seat)));
  let core = [...rules];
  for (const rule of rules) {
    const rest = core.filter((r) => r !== rule);
    if (excludesAll(rest)) core = rest;
  }
  return core.map((r) => r.id);
}

/**
 * Hall's theorem: if some group of students can only use fewer seats than
 * there are students in the group, no arrangement exists. A maximum matching
 * between students and their seat options finds such a group when it exists.
 * @param {Problem} problem
 * @returns {SeatingProblem | null}
 */
function crowdedGroup({ studentIds, domains, restrictedBy }) {
  /** @type {Map<string, string>} seat → student */
  const holder = new Map();
  const place = (id, seen) => {
    for (const seat of domains.get(id)) {
      if (seen.has(seat)) continue;
      seen.add(seat);
      const current = holder.get(seat);
      if (!current || place(current, seen)) {
        holder.set(seat, id);
        return true;
      }
    }
    return false;
  };
  for (const id of studentIds) {
    if (place(id, new Set())) continue;
    // Students reachable from `id` by alternating paths need more seats than they share.
    const group = new Set([id]);
    const seats = new Set();
    const queue = [id];
    while (queue.length) {
      for (const seat of domains.get(queue.shift())) {
        if (seats.has(seat)) continue;
        seats.add(seat);
        const current = holder.get(seat);
        if (current && !group.has(current)) {
          group.add(current);
          queue.push(current);
        }
      }
    }
    const ruleIds = [...new Set([...group].flatMap((s) => restrictedBy.get(s).map((r) => r.id)))];
    return { kind: 'crowded', studentIds: [...group], seatIds: [...seats], ruleIds };
  }
  return null;
}

/** True when every student sits where they sat in `previous`. */
function samePlacement(seatOf, previous) {
  for (const [id, seat] of seatOf) if (previous.get(id) !== seat) return false;
  return true;
}

/**
 * Randomized backtracking search with forward checking.
 * @param {SearchProblem} problem
 * @param {ReturnType<typeof createRng>} rng
 * @param {number} maxNodes
 * @param {Map<string, string> | null} previous arrangement to skip, if any
 * @param {Map<string, number>} conflicts counts how often each rule caused a dead end
 */
function search(problem, rng, maxNodes, previous, conflicts) {
  const { topo, studentIds, domains, hardOf } = problem;
  const tieBreak = new Map(rng.shuffle(studentIds).map((id, i) => [id, i]));
  const options = new Map(studentIds.map((id) => [id, new Set(domains.get(id))]));
  /** @type {Map<string, string>} */
  const seatOf = new Map();
  const ctx = { topo, seatOf: (id) => seatOf.get(id) };
  const trail = []; // removed options as [student, seat, student, seat, …] for undoing
  let nodes = 0;
  let limit = false;
  let rejectedPrevious = false;

  const blame = (rule) => conflicts.set(rule.id, (conflicts.get(rule.id) ?? 0) + 1);
  const drop = (id, seat) => {
    options.get(id).delete(seat);
    trail.push(id, seat);
  };

  /** Removes options that `id` sitting in `seat` rules out; false on a dead end. */
  function propagate(id, seat) {
    for (const other of studentIds) {
      if (seatOf.has(other) || !options.get(other).has(seat)) continue;
      drop(other, seat);
      if (options.get(other).size === 0) return false;
    }
    for (const rule of hardOf.get(id)) {
      const def = RULE_TYPES[rule.type];
      if (def.compatible) {
        for (const other of rule.studentIds) {
          if (other === id || seatOf.has(other)) continue;
          for (const candidate of [...options.get(other)]) {
            if (!def.compatible(rule, seat, candidate, topo)) drop(other, candidate);
          }
          if (options.get(other).size === 0) {
            blame(rule);
            return false;
          }
        }
      }
      // Whole-group check once every student of the rule has a seat.
      if (rule.studentIds.every((s) => seatOf.has(s)) && !def.evaluate(rule, ctx).ok) {
        blame(rule);
        return false;
      }
    }
    return true;
  }

  function nextStudent() {
    let chosen = null;
    let size = Infinity;
    let degree = -1;
    for (const id of studentIds) {
      if (seatOf.has(id)) continue;
      const s = options.get(id).size;
      const d = hardOf.get(id).length;
      if (s < size || (s === size && (d > degree || (d === degree && tieBreak.get(id) < tieBreak.get(chosen))))) {
        chosen = id;
        size = s;
        degree = d;
      }
    }
    return chosen;
  }

  function solve(depth) {
    if (depth === studentIds.length) {
      if (previous && samePlacement(seatOf, previous)) {
        rejectedPrevious = true;
        return false;
      }
      return true;
    }
    if (++nodes > maxNodes) {
      limit = true;
      return false;
    }
    const id = nextStudent();
    for (const seat of rng.shuffle([...options.get(id)])) {
      const mark = trail.length;
      seatOf.set(id, seat);
      if (propagate(id, seat) && solve(depth + 1)) return true;
      seatOf.delete(id);
      while (trail.length > mark) {
        const s = trail.pop();
        options.get(trail.pop()).add(s);
      }
      if (limit) return false;
    }
    return false;
  }

  const found = solve(0);
  return {
    status: found ? 'found' : limit ? 'limit' : 'exhausted',
    assignment: found ? new Map(seatOf) : null,
    nodes,
    rejectedPrevious,
  };
}

const isBetter = (a, b) => a.penalty < b.penalty || (a.penalty === b.penalty && a.variation < b.variation);

/**
 * Simulated annealing over moves and swaps that keep every hard rule.
 * Minimizes unmet preferences first, then seats repeated from `previous`.
 * @param {Problem} problem
 * @param {Map<string, string>} start
 * @param {ReturnType<typeof createRng>} rng
 * @param {Map<string, string> | null} previous
 * @param {number} steps
 */
function improve(problem, start, rng, previous, steps) {
  const { topo, studentIds, domains, hardOf, softOf, soft } = problem;
  const seatOf = new Map(start);
  const occupant = new Map([...seatOf].map(([id, seat]) => [seat, id]));
  const ctx = { topo, seatOf: (id) => seatOf.get(id) };
  const penaltyOf = (rules) => rules.reduce((sum, r) => sum + ruleWeight(r) * RULE_TYPES[r.type].evaluate(r, ctx).penalty, 0);
  const repeated = (id) => (previous && previous.get(id) === seatOf.get(id) ? 1 : 0);

  let penalty = penaltyOf(soft);
  let variation = studentIds.reduce((n, id) => n + repeated(id), 0);
  const snapshot = () => ({ assignment: new Map(seatOf), penalty, variation });
  let best = snapshot();
  if (!soft.length && !previous) return best;

  const choices = new Map(studentIds.map((id) => [id, [...domains.get(id)]]));
  const total = steps || Math.min(20000, 200 * studentIds.length);
  const place = (id, seat) => {
    seatOf.set(id, seat);
    occupant.set(seat, id);
  };

  for (let step = 0; step < total; step++) {
    const temperature = 0.6 * (1 - step / total) + 0.01;
    const a = rng.pick(studentIds);
    const from = seatOf.get(a);
    const to = rng.pick(choices.get(a));
    if (to === from) continue;
    const b = occupant.get(to);
    if (b && !domains.get(b).has(from)) continue;

    const softRules = b ? [...new Set([...softOf.get(a), ...softOf.get(b)])] : softOf.get(a);
    const hardRules = b ? [...new Set([...hardOf.get(a), ...hardOf.get(b)])] : hardOf.get(a);
    const before = penaltyOf(softRules);
    const repeatedBefore = repeated(a) + (b ? repeated(b) : 0);

    const undo = () => {
      place(a, from);
      if (b) place(b, to);
      else occupant.delete(to);
    };
    place(a, to);
    if (b) place(b, from);
    else occupant.delete(from);

    if (!hardRules.every((r) => RULE_TYPES[r.type].evaluate(r, ctx).ok)) {
      undo();
      continue;
    }
    const after = penaltyOf(softRules);
    const repeatedAfter = repeated(a) + (b ? repeated(b) : 0);
    const delta = after - before + VARIATION_WEIGHT * (repeatedAfter - repeatedBefore);
    if (delta > 0 && rng.next() >= Math.exp(-delta / temperature)) {
      undo();
      continue;
    }
    penalty += after - before;
    variation += repeatedAfter - repeatedBefore;
    if (isBetter({ penalty, variation }, best) && !(previous && samePlacement(seatOf, previous))) best = snapshot();
  }
  return best;
}

/**
 * Rule-by-rule consistency before the main search: removes each seat from
 * which a rule linking students cannot be met even on its own (e.g. a group of
 * three who must sit together, in a seat that has no two free neighbours).
 * Without this, the search would only discover such dead ends deep down, over
 * and over. Returns false when a student is left without options, or a group
 * of students without enough seats.
 * @param {Problem} problem
 */
function narrowByRules(problem) {
  const { topo, hard, domains } = problem;
  const rng = createRng(1);
  for (const rule of hard) {
    if (RULE_TYPES[rule.type].allowedSeats) continue;
    const members = rule.studentIds;
    if (members.reduce((n, id) => n + domains.get(id).size, 0) > 600) continue; // too costly to be worth it
    const hardOf = new Map(members.map((id) => [id, [rule]]));
    for (const id of members) {
      const domain = domains.get(id);
      for (const seat of [...domain]) {
        const local = { topo, studentIds: members, hardOf, domains: new Map(members.map((m) => [m, m === id ? new Set([seat]) : domains.get(m)])) };
        if (search(local, rng, 200, null, new Map()).status === 'exhausted') domain.delete(seat);
      }
      if (domain.size === 0) return false;
    }
  }
  return !crowdedGroup(problem);
}

/**
 * True only when it is proven (within `budget` search steps) that no
 * arrangement exists.
 * @param {Problem} problem
 * @param {number} budget
 */
function isImpossible(problem, budget) {
  if (precheck(problem) || !narrowByRules(problem)) return true;
  return search(problem, createRng(1), budget, null, new Map()).status === 'exhausted';
}

/**
 * A smallest set of hard rules that cannot all be followed: every rule in it
 * is needed for the conflict. Tried first with only the students those rules
 * mention (small and fast); if the conflict also depends on everyone else
 * taking up seats, with the whole class. Returns null if no conflict could be
 * proven within the search budget.
 * @param {Problem} problem
 * @param {typeof DEFAULT_OPTIONS} opts
 * @returns {string[] | null}
 */
function explainConflict(problem, opts) {
  const subset = (rules, everyone) => {
    const mentioned = new Set(rules.flatMap((r) => r.studentIds));
    const ids = everyone ? problem.studentIds : problem.studentIds.filter((id) => mentioned.has(id));
    return makeProblem(problem.topo, ids, rules, []);
  };
  const impossible = (rules, everyone) => isImpossible(subset(rules, everyone), opts.explainNodes);
  let everyone = false;
  if (!impossible(problem.hard, false)) {
    if (!impossible(problem.hard, true)) return null;
    everyone = true;
  }
  let core = problem.hard;
  for (const rule of problem.hard) {
    const rest = core.filter((r) => r !== rule);
    if (impossible(rest, everyone)) core = rest;
  }
  return core.map((r) => r.id);
}

/** Rules behind most dead ends during a search that ran out of budget. */
function mostConflicting(conflicts) {
  return [...conflicts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);
}
