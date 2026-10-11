// Export: printable seating chart and CSV.
import { state, view } from './store.js';
import { sortSeats } from './layout.js';
import { t, formatDay } from './i18n.js';
import { h, download, slug } from './util.js';
import { onClick } from './ui/dom.js';
import { chartHTML } from './ui/chart.js';

const csvCell = (value) => {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One line per seat (front to back), then students without a seat. */
export function seatingCsv(v) {
  const lines = [[t('export.csvSeat'), t('export.csvRow'), t('export.csvStudent'), t('export.csvNotes')]];
  for (const seat of sortSeats(v.doc.seats)) {
    if (!seat.enabled) continue;
    const id = v.occupant.get(seat.id);
    const student = id ? v.student(id) : null;
    lines.push([v.seatLabel(seat.id), v.topo.rowRank(seat.id) + 1, student ? v.studentLabel(id) : '', student?.notes ?? '']);
  }
  for (const s of v.unseated) lines.push(['', '', v.studentLabel(s.id), s.notes]);
  // BOM so spreadsheet apps read accents correctly.
  return `﻿${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function printChart() {
  const v = view();
  const sheet = document.getElementById('print-sheet');
  const roster = [...v.doc.students]
    .filter((s) => s.included)
    .sort((a, b) => v.studentLabel(a.id).localeCompare(v.studentLabel(b.id)))
    .map((s) => `<li><span>${h(v.studentLabel(s.id))}</span><span>${h(v.seatOf.has(s.id) ? v.seatLabel(v.seatOf.get(s.id)) : '—')}</span></li>`)
    .join('');
  sheet.innerHTML = `
    <header class="print-head">
      <h1>${h(v.doc.name)}</h1>
      <p>${h(t('export.printDate', { date: formatDay(new Date().toISOString()) }))}</p>
    </header>
    ${chartHTML(v, { mode: 'print' })}
    <section class="print-roster"><h2>${h(t('export.roster'))}</h2><ol>${roster}</ol></section>`;
  window.print();
}

onClick({
  print: () => {
    if (state.doc?.plan) printChart();
  },
  'export-csv': () => {
    if (!state.doc?.plan) return;
    download(`${slug(state.doc.name)}-seating.csv`, seatingCsv(view()), 'text/csv;charset=utf-8');
  },
});
