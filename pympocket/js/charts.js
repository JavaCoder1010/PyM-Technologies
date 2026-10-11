// Gráficos en SVG sin librerías. Cada gráfico lleva una descripción para
// lectores de pantalla y siempre va acompañado de los datos en texto.
import { h } from './util.js';

/** Gráfico de anillo. segments: [{ value, color, label }] */
export function donut(segments, { size = 200, thickness = 30, title = '', center = '', centerSub = '' } = {}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  let offset = 0;
  const arcs = total
    ? segments
        .filter((s) => s.value > 0)
        .map((s) => {
          const len = (s.value / total) * c;
          const gap = segments.length > 1 ? Math.min(2, len / 4) : 0;
          const arc = `<circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${h(s.color)}" stroke-width="${thickness}"
            stroke-dasharray="${Math.max(len - gap, 0.01)} ${c}" stroke-dashoffset="${-offset}"
            transform="rotate(-90 ${mid} ${mid})"><title>${h(s.label)}</title></circle>`;
          offset += len;
          return arc;
        })
        .join('')
    : `<circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${thickness}"/>`;
  return `<svg class="chart donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${h(title)}">
    ${arcs}
    <text x="${mid}" y="${mid - 4}" text-anchor="middle" class="donut-center">${h(center)}</text>
    <text x="${mid}" y="${mid + 16}" text-anchor="middle" class="donut-sub">${h(centerSub)}</text>
  </svg>`;
}

/** Barras verticales. data: [{ label, value, highlight }] */
export function bars(data, { height = 180, title = '', format = String } = {}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = 56;
  const barW = 30;
  const top = 22;
  const bottom = 24;
  const inner = height - top - bottom;
  const width = data.length * slot;
  const items = data
    .map((d, i) => {
      const hgt = Math.max((d.value / max) * inner, d.value > 0 ? 2 : 0);
      const x = i * slot + (slot - barW) / 2;
      const y = top + inner - hgt;
      return `<g>
        <rect x="${x}" y="${y}" width="${barW}" height="${hgt}" rx="5" class="${d.highlight ? 'bar bar-hi' : 'bar'}"><title>${h(d.label)}: ${h(format(d.value))}</title></rect>
        <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" class="bar-value">${d.value ? h(format(d.value)) : ''}</text>
        <text x="${x + barW / 2}" y="${height - 6}" text-anchor="middle" class="bar-label">${h(d.label)}</text>
      </g>`;
    })
    .join('');
  return `<div class="chart-scroll"><svg class="chart bars" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${h(title)}">
    <line x1="0" x2="${width}" y1="${top + inner}" y2="${top + inner}" class="axis"/>${items}</svg></div>`;
}

// ---------- Gráficos con ejes (columnas y líneas) ----------
// Se dibujan en un viewBox fijo y se escalan al ancho disponible; en
// pantallas angostas se desplazan horizontalmente para no perder legibilidad.

const PAD = { top: 14, right: 10, bottom: 26, left: 58 };

/** Ancho del dibujo parecido al de la tarjeta, para que los textos se lean a tamaño real. */
const chartWidth = () => Math.round(Math.min(Math.max((globalThis.innerWidth ?? 640) - 66, 300), 640));

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Marco común: líneas guía con sus valores y la escala vertical. */
function frame(width, height, rawMax, format) {
  const max = niceMax(rawMax);
  const inner = height - PAD.top - PAD.bottom;
  const y = (v) => PAD.top + inner - (v / max) * inner;
  const grid = [0, 0.5, 1]
    .map((f) => {
      const yy = y(max * f);
      return `<line x1="${PAD.left}" x2="${width - PAD.right}" y1="${yy}" y2="${yy}" class="${f ? 'grid' : 'axis'}"/>
        <text x="${PAD.left - 6}" y="${yy + 4}" text-anchor="end" class="tick">${h(format(max * f))}</text>`;
    })
    .join('');
  return { y, grid, inner, plotW: width - PAD.left - PAD.right };
}

const svgOpen = (width, height, title, minWidth, cls) =>
  `<div class="chart-scroll"><svg class="chart chart-fluid ${cls}" viewBox="0 0 ${width} ${height}" style="min-width:${minWidth}px" role="img" aria-label="${h(title)}">`;

/**
 * Columnas agrupadas o apiladas.
 * groups: [{ label, highlight, series: [{ value, color, label }] }]
 */
export function columns(groups, { width = chartWidth(), height = 220, title = '', format = String, stacked = false, labelEvery = 1, minWidth = 0 } = {}) {
  const totals = groups.map((g) => (stacked ? g.series.reduce((a, s) => a + s.value, 0) : Math.max(0, ...g.series.map((s) => s.value))));
  const { y, grid, plotW } = frame(width, height, Math.max(...totals, 0), format);
  const slot = plotW / Math.max(groups.length, 1);
  const base = y(0);
  const cols = groups
    .map((g, i) => {
      const x0 = PAD.left + i * slot;
      const n = stacked ? 1 : g.series.length;
      const barW = Math.min(slot * 0.72, 34 * n) / n;
      const start = x0 + (slot - barW * n) / 2;
      let acc = 0;
      const rects = g.series
        .map((s, j) => {
          if (!(s.value > 0)) return '';
          const top = y(stacked ? acc + s.value : s.value);
          const bottom = stacked ? y(acc) : base;
          acc += s.value;
          const x = stacked ? start : start + j * barW;
          return `<rect x="${x}" y="${top}" width="${Math.max(barW - (stacked ? 0 : 2), 1)}" height="${Math.max(bottom - top, 1)}" style="fill:${h(s.color)}" rx="${stacked ? 0 : 3}" class="${g.highlight ? 'col col-hi' : 'col'}">
            <title>${h(g.label)} · ${h(s.label)}: ${h(format(s.value))}</title></rect>`;
        })
        .join('');
      const nearHighlight = labelEvery > 1 && groups.some((o, k) => o.highlight && k !== i && Math.abs(k - i) <= 2);
      const label = g.highlight || (i % labelEvery === 0 && !nearHighlight) ?`<text x="${x0 + slot / 2}" y="${height - 8}" text-anchor="middle" class="bar-label ${g.highlight ? 'label-hi' : ''}">${h(slot < 34 && g.short ? g.short : g.label)}</text>` : '';
      return `<g>${rects}${label}</g>`;
    })
    .join('');
  return `${svgOpen(width, height, title, minWidth, 'columns')}${grid}${cols}</svg></div>`;
}

/**
 * Líneas (por ejemplo, gasto acumulado). series: [{ label, color, values, dashed }]
 * Los valores null no se dibujan (días que todavía no pasaron).
 */
export function lines(series, { xLabels = [], width = chartWidth(), height = 220, title = '', format = String, labelEvery = 5, minWidth = 0 } = {}) {
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  const { y, grid, plotW } = frame(width, height, Math.max(...all, 0), format);
  const count = Math.max(...series.map((s) => s.values.length), 2);
  const x = (i) => PAD.left + (i / (count - 1)) * plotW;
  const paths = series
    .map((s) => {
      const pts = s.values.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
      if (!pts.length) return '';
      const last = pts.at(-1).split(',');
      return `<polyline points="${pts.join(' ')}" fill="none" style="stroke:${h(s.color)}" stroke-width="2.5" stroke-linejoin="round" ${s.dashed ? 'stroke-dasharray="6 5"' : ''}>
          <title>${h(s.label)}</title></polyline>
        <circle cx="${last[0]}" cy="${last[1]}" r="4" style="fill:${h(s.color)}"/>`;
    })
    .join('');
  const labels = xLabels
    .map((l, i) => (i % labelEvery === 0 || i === xLabels.length - 1 ? `<text x="${x(i)}" y="${height - 8}" text-anchor="middle" class="bar-label">${h(l)}</text>` : ''))
    .join('');
  return `${svgOpen(width, height, title, minWidth, 'lines')}${grid}${paths}${labels}</svg></div>`;
}

/** Referencias de colores para gráficos con varias series. */
export const legend = (items) =>
  `<ul class="legend">${items
    .map((i) => `<li><span class="legend-swatch ${i.dashed ? 'dashed' : ''}" style="--c:${h(i.color)}" aria-hidden="true"></span>${h(i.label)}</li>`)
    .join('')}</ul>`;

/** Barra de progreso accesible. */
export function progress(ratio, { label = '', level = 'ok' } = {}) {
  const pct = Math.max(0, Math.min(ratio, 1)) * 100;
  return `<div class="progress progress-${level}" role="progressbar" aria-label="${h(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}">
    <span style="width:${pct}%"></span></div>`;
}
