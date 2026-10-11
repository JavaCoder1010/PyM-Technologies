// @ts-check
// Classroom geometry: the seat grid, seat labels and what "next to each other"
// means. No DOM here: the engine, the validator and the interface all use this
// same model, so a rule is always judged by one definition of "next to".
//
// Adjacency model:
// - Seats immediately left/right of each other in the same row are next to each
//   other. An empty grid cell (aisle or gap) between them breaks this.
// - Front/behind and diagonal neighbours count only if turned on in settings.
// - Disabled seats are not usable and are never anyone's neighbour.

/** @typedef {import('./model.js').Seat} Seat */
/** @typedef {import('./model.js').Adjacency} Adjacency */

export const DEFAULT_ADJACENCY = Object.freeze({ frontBack: false, diagonal: false });

/** Row letter: 0 → A, 25 → Z, 26 → AA. */
export function rowLetter(index) {
  let s = '';
  let n = index;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * Seats for a standard classroom: `rows` rows of `desksPerRow` desks, each desk
 * `seatsPerDesk` seats wide, with an aisle (empty column) between desks when
 * `aisles` is set. Seats already at the same grid cell keep their id and
 * settings, so rules that point at them survive a re-layout.
 * @param {{ rows: number, desksPerRow: number, seatsPerDesk: number, aisles: boolean }} options
 * @param {() => string} makeId
 * @param {Seat[]} [existing]
 */
export function gridSeats({ rows, desksPerRow, seatsPerDesk, aisles }, makeId, existing = []) {
  const keep = new Map(existing.map((s) => [`${s.row},${s.col}`, s]));
  const step = seatsPerDesk + (aisles ? 1 : 0);
  const cols = desksPerRow * step - (aisles ? 1 : 0);
  /** @type {Seat[]} */
  const seats = [];
  for (let row = 0; row < rows; row++) {
    for (let desk = 0; desk < desksPerRow; desk++) {
      for (let k = 0; k < seatsPerDesk; k++) {
        const col = desk * step + k;
        const old = keep.get(`${row},${col}`);
        seats.push(old ? { ...old } : { id: makeId(), row, col, enabled: true, label: '' });
      }
    }
  }
  return { rows, cols, seats };
}

/**
 * Labels like "B3": row letter (the front row is A) and position in the row
 * from the left. A custom label set by the teacher wins.
 * @param {Seat[]} seats
 * @returns {Map<string, string>}
 */
export function seatLabels(seats) {
  const rows = [...new Set(seats.map((s) => s.row))].sort((a, b) => a - b);
  const letter = new Map(rows.map((r, i) => [r, rowLetter(i)]));
  const sorted = [...seats].sort((a, b) => a.row - b.row || a.col - b.col);
  const labels = new Map();
  let lastRow = -1;
  let position = 0;
  for (const s of sorted) {
    if (s.row !== lastRow) {
      lastRow = s.row;
      position = 0;
    }
    position++;
    labels.set(s.id, s.label?.trim() || `${letter.get(s.row)}${position}`);
  }
  return labels;
}

/** Seats sorted front to back, left to right. @param {Seat[]} seats */
export const sortSeats = (seats) => [...seats].sort((a, b) => a.row - b.row || a.col - b.col);

const NONE = new Set();

/**
 * The classroom as a graph: which seats are usable and which are next to which.
 * @param {Seat[]} seats
 * @param {Adjacency} [adjacency]
 */
export function buildTopology(seats, adjacency = DEFAULT_ADJACENCY) {
  const byId = new Map(seats.map((s) => [s.id, s]));
  const byCell = new Map(seats.map((s) => [`${s.row},${s.col}`, s]));
  const usable = sortSeats(seats.filter((s) => s.enabled));

  const offsets = [[0, -1], [0, 1]];
  if (adjacency.frontBack) offsets.push([-1, 0], [1, 0]);
  if (adjacency.diagonal) offsets.push([-1, -1], [-1, 1], [1, -1], [1, 1]);

  /** @type {Map<string, Set<string>>} */
  const neighbors = new Map();
  for (const s of usable) {
    const set = new Set();
    for (const [dr, dc] of offsets) {
      const other = byCell.get(`${s.row + dr},${s.col + dc}`);
      if (other?.enabled) set.add(other.id);
    }
    neighbors.set(s.id, set);
  }

  // Front/back is measured in rows that have at least one usable seat.
  const rowsUsed = [...new Set(usable.map((s) => s.row))].sort((a, b) => a - b);
  const rank = new Map(rowsUsed.map((r, i) => [r, i]));
  const labels = seatLabels(seats);

  /** @type {Map<string, Map<string, number>>} */
  const distances = new Map();
  /** Steps between usable seats, moving only between neighbours (breadth-first search). */
  function distancesFrom(id) {
    let found = distances.get(id);
    if (found) return found;
    found = new Map([[id, 0]]);
    const queue = [id];
    while (queue.length) {
      const current = queue.shift();
      for (const next of neighbors.get(current) ?? NONE) {
        if (found.has(next)) continue;
        found.set(next, found.get(current) + 1);
        queue.push(next);
      }
    }
    distances.set(id, found);
    return found;
  }

  const rowRank = (id) => rank.get(byId.get(id)?.row) ?? -1;

  return {
    /** Usable seat ids, front to back, left to right. */
    usableIds: usable.map((s) => s.id),
    /** Number of rows with at least one usable seat. */
    rowCount: rowsUsed.length,
    seat: (id) => byId.get(id),
    isUsable: (id) => Boolean(byId.get(id)?.enabled),
    /** @returns {Set<string>} */
    neighbors: (id) => neighbors.get(id) ?? NONE,
    adjacent: (a, b) => neighbors.get(a)?.has(b) ?? false,
    distance: (a, b) => (neighbors.has(a) ? distancesFrom(a).get(b) ?? Infinity : Infinity),
    /** 0 for the front row of usable seats; -1 for an unusable seat. */
    rowRank,
    inFrontRows: (id, rows) => neighbors.has(id) && rowRank(id) < rows,
    inBackRows: (id, rows) => neighbors.has(id) && rowRank(id) >= rowsUsed.length - rows,
    label: (id) => labels.get(id) ?? '?',
  };
}

/** @typedef {ReturnType<typeof buildTopology>} Topology */

/**
 * How many separate clusters the given seats form (1 = all connected through
 * neighbouring seats in the set).
 * @param {Topology} topo
 * @param {string[]} seatIds
 */
export function componentCount(topo, seatIds) {
  const remaining = new Set(seatIds);
  let parts = 0;
  for (const start of seatIds) {
    if (!remaining.has(start)) continue;
    parts++;
    remaining.delete(start);
    const stack = [start];
    while (stack.length) {
      const id = stack.pop();
      for (const next of topo.neighbors(id)) {
        if (!remaining.has(next)) continue;
        remaining.delete(next);
        stack.push(next);
      }
    }
  }
  return parts;
}
