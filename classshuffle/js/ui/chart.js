// The classroom floor plan. One renderer, four modes:
//   plan    — the seating plan: select, move and swap students
//   layout  — edit the room: add, remove, disable and move seats
//   pick    — choose seats for a rule (in the rule editor)
//   print   — static, for the printed chart
import { t } from '../i18n.js';
import { h, icon } from '../util.js';

/** @typedef {import('../store.js').View} View */

/**
 * @param {View} v
 * @param {{
 *   mode: 'plan' | 'layout' | 'pick' | 'print',
 *   selection?: { studentId?: string, seatId?: string } | null,
 *   picked?: Set<string>,
 *   highlight?: Set<string>,
 *   compact?: boolean,
 * }} options
 */
export function chartHTML(v, { mode, selection = null, picked = new Set(), highlight = new Set(), compact = false }) {
  const { doc, topo } = v;
  const { rows, cols } = doc.layout;
  const byCell = new Map(doc.seats.map((s) => [`${s.row},${s.col}`, s]));
  const selectedSeat = selection?.seatId ?? (selection?.studentId ? v.seatOf.get(selection.studentId) : null);
  const neighbors = mode === 'plan' && selectedSeat ? topo.neighbors(selectedSeat) : new Set();

  // Columns without any seat are aisles: drawn narrow (wider while editing, to add seats).
  const seatCols = new Set(doc.seats.map((s) => s.col));
  const template = Array.from({ length: cols }, (_, c) => (seatCols.has(c) ? 'var(--seat-col)' : 'var(--aisle-col)')).join(' ');

  let cells = '';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const seat = byCell.get(`${row},${col}`);
      const join = seat
        ? `${byCell.has(`${row},${col - 1}`) ? ' join-l' : ''}${byCell.has(`${row},${col + 1}`) ? ' join-r' : ''}`
        : '';
      const ctx = { v, seat, row, col, join, selection, selectedSeat, neighbors, picked, highlight };
      cells += seat ? seatCell(mode, ctx) : emptyCell(mode, ctx);
    }
  }

  return `
    <div class="room${compact ? ' room-compact' : ''} room-${mode}">
      <div class="room-front" aria-hidden="true"><span class="board">${h(t('chart.board'))}</span></div>
      <div class="grid" style="grid-template-columns:${template}" role="group" aria-label="${h(t('chart.label', { rows, cols }))}">
        ${cells}
      </div>
      <div class="room-back" aria-hidden="true">${h(t('chart.back'))}</div>
    </div>`;
}

function emptyCell(mode, { row, col }) {
  if (mode !== 'layout') return '<div class="cell"></div>';
  return `<button type="button" class="cell cell-add" data-action="layout-cell" data-cell="${row},${col}" data-drop="cell"
    aria-label="${h(t('layout.addSeatAt', { row: row + 1, col: col + 1 }))}">${icon('plus')}</button>`;
}

function seatCell(mode, ctx) {
  const { v, seat, join, selectedSeat } = ctx;
  const label = v.seatLabel(seat.id);
  const seatLabel = `<span class="seat-label">${h(label)}</span>`;

  if (mode === 'pick') {
    if (!seat.enabled) return `<div class="seat seat-off${join}" title="${h(t('chart.unavailable'))}">${seatLabel}</div>`;
    const on = ctx.picked.has(seat.id);
    const occupant = v.occupant.get(seat.id);
    return `<button type="button" class="seat seat-pick${on ? ' is-picked' : ''}${join}" data-action="pick-seat" data-seat="${seat.id}"
      aria-pressed="${on}" aria-label="${h(t('chart.seat', { label }))}">${seatLabel}
      ${occupant ? `<span class="seat-name seat-name-sm">${h(v.studentLabel(occupant))}</span>` : ''}
      ${on ? icon('check', 'icon seat-flag') : ''}</button>`;
  }

  if (mode === 'layout') {
    const selected = selectedSeat === seat.id;
    const occupant = v.occupant.get(seat.id);
    return `<button type="button" class="seat seat-layout${seat.enabled ? '' : ' seat-off'}${selected ? ' is-selected' : ''}${join}"
      data-action="layout-seat" data-seat="${seat.id}" data-drag="seat" data-id="${seat.id}" data-drop="seat" aria-pressed="${selected}"
      aria-label="${h(t(seat.enabled ? 'chart.seat' : 'chart.seatOff', { label }))}">
      ${seatLabel}
      ${seat.enabled ? (occupant ? `<span class="seat-name seat-name-sm">${h(v.studentLabel(occupant))}</span>` : '') : `<span class="seat-empty">${h(t('chart.unavailable'))}</span>`}
    </button>`;
  }

  // plan and print
  if (!seat.enabled) {
    return `<div class="seat seat-off${join}" role="img" aria-label="${h(t('chart.seatOff', { label }))}">${seatLabel}
      <span class="seat-empty">${h(t('chart.unavailable'))}</span></div>`;
  }
  const studentId = v.occupant.get(seat.id);
  const name = studentId ? v.studentLabel(studentId) : '';
  const state = [
    studentId ? 'is-occupied' : 'is-empty',
    selectedSeat === seat.id ? 'is-selected' : '',
    ctx.neighbors.has(seat.id) ? 'is-neighbor' : '',
    v.brokenSeats.has(seat.id) || (studentId && v.brokenStudents.has(studentId)) ? 'is-invalid' : '',
    studentId && v.unmetStudents.has(studentId) ? 'is-warn' : '',
    ctx.highlight.has(seat.id) ? 'is-highlight' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const locked = studentId && v.fixedSeat.get(studentId) === seat.id;
  const flags = `${locked ? icon('lock', 'icon seat-flag') : ''}${state.includes('is-invalid') ? icon('alert', 'icon seat-flag seat-flag-bad') : state.includes('is-warn') ? icon('alert', 'icon seat-flag seat-flag-warn') : ''}`;
  const body = `${seatLabel}${studentId ? `<span class="seat-name">${h(name)}</span>` : `<span class="seat-empty">${h(t('chart.empty'))}</span>`}${flags}`;

  if (mode === 'print') return `<div class="seat ${state}${join}">${body}</div>`;

  const aria = studentId
    ? t('chart.seatWith', { label, name }) + (state.includes('is-invalid') ? `. ${t('chart.breaksRule')}` : '')
    : t('chart.seatEmpty', { label });
  return `<button type="button" class="seat ${state}${join}" data-action="seat" data-seat="${seat.id}" data-drop="seat"
    ${studentId ? `data-drag="student" data-id="${studentId}"` : ''} aria-pressed="${selectedSeat === seat.id}" aria-label="${h(aria)}" title="${h(name || label)}">${body}</button>`;
}
