// Editing the classroom layout: grid size, adding/removing/disabling/moving
// seats, quick setup of standard desk rows, and what counts as "next to".
import { state, commit, notify, view, undo } from '../store.js';
import { newId } from '../model.js';
import {
  removeSeats,
  seatRemovalImpact,
  setSeatEnabled,
  resizeGrid,
  seatsOutside,
  addRowCopyingLast,
  applyGridLayout,
  gridLayoutRemovals,
} from '../classroom.js';
import { t } from '../i18n.js';
import { h, icon } from '../util.js';
import { onClick, onSubmit, onInput, openDialog, closeDialog, dialogHeader, confirmDialog, toast } from './dom.js';

/** @typedef {import('../store.js').View} View */

const MAX_ROWS = 20;
const MAX_COLS = 24;

/** @param {View} v */
export function layoutBarHTML(v) {
  const { rows, cols } = v.doc.layout;
  const stepper = (label, value, dec, inc, max) => `
    <div class="stepper" role="group" aria-label="${h(label)}">
      <span class="stepper-label">${h(label)}</span>
      <button type="button" class="icon-btn" data-action="${dec}" ${value <= 1 ? 'disabled' : ''} aria-label="${h(t('layout.fewer', { what: label }))}">${icon('minus')}</button>
      <span class="stepper-value" aria-live="polite">${value}</span>
      <button type="button" class="icon-btn" data-action="${inc}" ${value >= max ? 'disabled' : ''} aria-label="${h(t('layout.more', { what: label }))}">${icon('plus')}</button>
    </div>`;
  return `
    <div class="layout-title">${icon('grid')}<span>${h(t('layout.editing'))}</span>
      <span class="muted">${h(t('layout.seatCount', { count: v.usableSeats }))}</span></div>
    <div class="stage-actions">
      ${stepper(t('layout.rows'), rows, 'row-remove', 'row-add', MAX_ROWS)}
      ${stepper(t('layout.columns'), cols, 'col-remove', 'col-add', MAX_COLS)}
      <button type="button" class="btn btn-ghost btn-sm" data-action="quick-layout">${icon('sparkle')}<span>${h(t('layout.quick'))}</span></button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="adjacency">${icon('link')}<span>${h(t('layout.neighbors'))}</span></button>
      <button type="button" class="btn btn-primary btn-sm" data-action="toggle-layout">${icon('check')}<span>${h(t('common.done'))}</span></button>
    </div>`;
}

/** Hint or selected-seat panel under the chart in layout mode. @param {View} v */
export function layoutInspectorHTML(v) {
  const seatId = state.ui.selection?.seatId;
  const seat = seatId && v.topo.seat(seatId);
  if (!seat) return `<p class="layout-hint">${icon('info')}<span>${h(t('layout.hint'))}</span></p>`;
  const occupant = v.occupant.get(seat.id);
  return `<section class="inspector" aria-label="${h(t('layout.seatPanel'))}">
    <div class="inspector-head">
      <div><h3 class="inspector-title">${h(t('inspector.seatTitle', { seat: v.seatLabel(seat.id) }))}</h3>
        <p class="inspector-sub">${h(seat.enabled ? (occupant ? v.studentLabel(occupant) : t('chart.empty')) : t('chart.unavailable'))}</p></div>
      <button type="button" class="icon-btn" data-action="clear-selection" aria-label="${h(t('common.close'))}">${icon('x')}</button>
    </div>
    <p class="hint">${h(t('layout.moveHint'))}</p>
    <form class="add-row" data-form="rename-seat">
      <input type="hidden" name="id" value="${seat.id}">
      <label class="sr-only" for="seat-label">${h(t('layout.labelField'))}</label>
      <input id="seat-label" name="label" maxlength="12" value="${h(seat.label)}" placeholder="${h(t('layout.labelPlaceholder', { auto: v.seatLabel(seat.id) }))}" autocomplete="off">
      <button type="submit" class="btn btn-secondary btn-sm">${h(t('layout.rename'))}</button>
    </form>
    <div class="inspector-actions">
      <button type="button" class="btn btn-secondary btn-sm" data-action="seat-toggle" data-id="${seat.id}">${icon(seat.enabled ? 'eye-off' : 'check')}<span>${h(t(seat.enabled ? 'layout.disable' : 'layout.enable'))}</span></button>
      <button type="button" class="btn btn-ghost btn-sm btn-danger-text" data-action="seat-remove" data-id="${seat.id}">${icon('trash')}<span>${h(t('layout.remove'))}</span></button>
    </div>
  </section>`;
}

/** Removes seats after confirming if students or rules use them. */
async function confirmAndRemoveSeats(ids, title) {
  if (!ids.length) return true;
  const impact = seatRemovalImpact(state.doc, ids);
  if (impact.seated || impact.rules) {
    const body = [
      impact.seated ? t('layout.removeSeated', { count: impact.seated }) : '',
      impact.rules ? t('layout.removeRules', { count: impact.rules }) : '',
    ]
      .filter(Boolean)
      .map((line) => `<p>${h(line)}</p>`)
      .join('');
    if (!(await confirmDialog({ title: h(title), body, confirm: t('layout.removeConfirm', { count: ids.length }) }))) return false;
  }
  return true;
}

function reportDropped(dropped) {
  if (dropped) toast(t('layout.rulesDropped', { count: dropped }), { kind: 'warn', action: { label: t('common.undo'), run: undo } });
}

function moveSeat(seatId, row, col) {
  commit((d) => {
    if (d.seats.some((s) => s.row === row && s.col === col)) return false;
    const seat = d.seats.find((s) => s.id === seatId);
    if (!seat) return false;
    seat.row = row;
    seat.col = col;
  });
}

/** Seat dropped on a cell or another seat (layout mode). Exported for the drag handler. */
export function dropSeat(seatId, target) {
  if (target.dataset.cell) {
    const [row, col] = target.dataset.cell.split(',').map(Number);
    moveSeat(seatId, row, col);
  } else if (target.dataset.seat && target.dataset.seat !== seatId) {
    // Swap positions of two seats.
    const other = target.dataset.seat;
    commit((d) => {
      const a = d.seats.find((s) => s.id === seatId);
      const b = d.seats.find((s) => s.id === other);
      if (!a || !b) return false;
      [a.row, a.col, b.row, b.col] = [b.row, b.col, a.row, a.col];
    });
  }
}

onClick({
  'toggle-layout': () => {
    state.ui.editingLayout = !state.ui.editingLayout;
    state.ui.selection = null;
    notify();
  },
  'layout-seat': (el) => {
    const id = el.dataset.seat;
    state.ui.selection = state.ui.selection?.seatId === id ? null : { seatId: id };
    notify();
  },
  'layout-cell': (el) => {
    const [row, col] = el.dataset.cell.split(',').map(Number);
    const selected = state.ui.selection?.seatId;
    if (selected) {
      moveSeat(selected, row, col);
      return;
    }
    const id = newId();
    commit((d) => {
      d.seats.push({ id, row, col, enabled: true, label: '' });
    });
  },
  'seat-toggle': (el) => {
    const seat = state.doc.seats.find((s) => s.id === el.dataset.id);
    if (!seat) return;
    const occupant = view().occupant.get(seat.id);
    commit((d) => setSeatEnabled(d, seat.id, !seat.enabled));
    if (occupant && seat.enabled) toast(t('layout.disabledUnseated', { name: view().studentLabel(occupant) }), { action: { label: t('common.undo'), run: undo } });
  },
  'seat-remove': async (el) => {
    const id = el.dataset.id;
    if (!(await confirmAndRemoveSeats([id], t('layout.removeTitle')))) return;
    let dropped = 0;
    commit((d) => {
      dropped = removeSeats(d, [id]);
    });
    state.ui.selection = null;
    notify();
    reportDropped(dropped);
  },
  'row-add': () => commit((d) => addRowCopyingLast(d)),
  'col-add': () =>
    commit((d) => {
      d.layout.cols += 1;
    }),
  'row-remove': async () => resize(state.doc.layout.rows - 1, state.doc.layout.cols),
  'col-remove': async () => resize(state.doc.layout.rows, state.doc.layout.cols - 1),
  'quick-layout': () => openQuickLayout(),
  adjacency: () => openAdjacency(),
});

async function resize(rows, cols) {
  if (rows < 1 || cols < 1) return;
  const outside = seatsOutside(state.doc, rows, cols);
  if (!(await confirmAndRemoveSeats(outside, t('layout.shrinkTitle', { count: outside.length })))) return;
  let dropped = 0;
  commit((d) => {
    dropped = resizeGrid(d, rows, cols);
  });
  reportDropped(dropped);
}

onSubmit({
  'rename-seat': (data) => {
    const id = String(data.get('id'));
    const label = String(data.get('label') ?? '').trim();
    commit((d) => {
      const seat = d.seats.find((s) => s.id === id);
      if (!seat || seat.label === label) return false;
      seat.label = label;
    });
  },
});

// ---------- Quick setup ----------

export const layoutFields = (values = {}) => {
  const { rows = 5, desksPerRow = 3, seatsPerDesk = 2, aisles = true } = values;
  const num = (name, label, value, max) => `<label class="field field-num"><span class="field-label">${h(label)}</span>
    <input class="input input-num" type="number" name="${name}" min="1" max="${max}" value="${value}" required data-input="layout-preview"></label>`;
  return `<div class="field-grid">
      ${num('rows', t('layout.form.rows'), rows, MAX_ROWS)}
      ${num('desksPerRow', t('layout.form.desks'), desksPerRow, 8)}
      ${num('seatsPerDesk', t('layout.form.seatsPerDesk'), seatsPerDesk, 6)}
    </div>
    <label class="check-label"><input type="checkbox" class="check" name="aisles" ${aisles ? 'checked' : ''} data-input="layout-preview"> ${h(t('layout.form.aisles'))}</label>
    <p class="muted" id="layout-preview" aria-live="polite">${h(t('layout.form.preview', { count: rows * desksPerRow * seatsPerDesk }))}</p>`;
};

/** Reads the quick-setup fields (clamped to sensible limits). */
export function readLayoutFields(data) {
  const n = (name, max) => Math.min(max, Math.max(1, Math.round(Number(data.get(name)) || 1)));
  return {
    rows: n('rows', MAX_ROWS),
    desksPerRow: n('desksPerRow', 8),
    seatsPerDesk: n('seatsPerDesk', 6),
    aisles: data.get('aisles') === 'on',
  };
}

onInput({
  'layout-preview': (el) => {
    const form = el.closest('form');
    const out = form?.querySelector('#layout-preview');
    if (!out) return;
    const o = readLayoutFields(new FormData(form));
    out.textContent = t('layout.form.preview', { count: o.rows * o.desksPerRow * o.seatsPerDesk });
  },
});

function openQuickLayout() {
  openDialog(`
    <form class="dialog-form" data-form="quick-layout">
      ${dialogHeader(h(t('layout.quickTitle')), h(t('layout.quickSubtitle')))}
      ${layoutFields()}
      <footer class="dialog-foot">
        <button type="button" class="btn btn-ghost" data-action="close-dialog">${h(t('common.cancel'))}</button>
        <button type="submit" class="btn btn-primary">${h(t('layout.quickApply'))}</button>
      </footer>
    </form>`);
}

onSubmit({
  'quick-layout': async (data) => {
    const options = readLayoutFields(data);
    closeDialog();
    const removed = gridLayoutRemovals(state.doc, options);
    if (!(await confirmAndRemoveSeats(removed, t('layout.quickConfirm', { count: removed.length })))) return;
    let dropped = 0;
    commit((d) => {
      dropped = applyGridLayout(d, options);
    });
    state.ui.selection = null;
    notify();
    reportDropped(dropped);
  },
});

// ---------- What counts as "next to" ----------

function openAdjacency() {
  const a = state.doc.adjacency;
  openDialog(`
    <form class="dialog-form" data-form="adjacency">
      ${dialogHeader(h(t('layout.neighborsTitle')), h(t('layout.neighborsSubtitle')))}
      <p class="field-note">${icon('check')}<span>${h(t('layout.neighborsAlways'))}</span></p>
      <label class="check-label check-block"><input type="checkbox" class="check" name="frontBack" ${a.frontBack ? 'checked' : ''}>
        <span><strong>${h(t('layout.frontBack'))}</strong><small>${h(t('layout.frontBackHint'))}</small></span></label>
      <label class="check-label check-block"><input type="checkbox" class="check" name="diagonal" ${a.diagonal ? 'checked' : ''}>
        <span><strong>${h(t('layout.diagonal'))}</strong><small>${h(t('layout.diagonalHint'))}</small></span></label>
      <p class="muted">${h(t('layout.neighborsNote'))}</p>
      <footer class="dialog-foot">
        <button type="button" class="btn btn-ghost" data-action="close-dialog">${h(t('common.cancel'))}</button>
        <button type="submit" class="btn btn-primary">${h(t('common.save'))}</button>
      </footer>
    </form>`);
}

onSubmit({
  adjacency: (data) => {
    const next = { frontBack: data.get('frontBack') === 'on', diagonal: data.get('diagonal') === 'on' };
    closeDialog();
    commit((d) => {
      if (d.adjacency.frontBack === next.frontBack && d.adjacency.diagonal === next.diagonal) return false;
      d.adjacency = next;
    });
  },
});
