// Startup and page layout: header, seating chart (stage) and side panel.
// Every change to the state re-renders the regions; patch() keeps focus.
import { state, subscribe, notify, view, undo, redo, loadIndex, openClassroom, flushSave } from './store.js';
import { lastOpened } from './repo.js';
import { t } from './i18n.js';
import { h, icon } from './util.js';
import { installEventDelegation, installDialog, patch, onClick, dialogIsOpen, toast } from './ui/dom.js';
import { installDrag } from './ui/drag.js';
import { chartHTML } from './ui/chart.js';
import { stageBarHTML, noticesHTML, trayHTML, inspectorHTML, savedPanelHTML, moveStudent } from './ui/plan.js';
import { studentsPanelHTML } from './ui/students.js';
import { rulesPanelHTML } from './ui/rules.js';
import { layoutBarHTML, layoutInspectorHTML, dropSeat } from './ui/layoutTools.js';
import { welcomeHTML, demoBannerHTML, openDemo } from './ui/classrooms.js';
import './export.js';

const $ = (id) => document.getElementById(id);

// ---------- Header ----------

const SAVE_ICON = { saved: 'check', saving: 'save', unsaved: 'dot', error: 'alert' };

function headerHTML() {
  const doc = state.doc;
  const brand = `<a class="brand" href="./" aria-label="${h(t('app.name'))}">
      <svg class="brand-logo" aria-hidden="true"><use href="#i-logo"/></svg>
      <span class="brand-name">${h(t('app.name'))}</span></a>`;
  if (!doc) return brand;
  const generating = state.ui.generating;
  return `${brand}
    <span class="topbar-sep" aria-hidden="true"></span>
    <button type="button" class="classroom-switch" data-action="open-classrooms" aria-haspopup="dialog" title="${h(t('header.switch'))}">
      <span class="classroom-name">${h(doc.name)}</span>${icon('chevron-down')}
    </button>
    <span class="save-status save-${state.save}" role="status">${icon(SAVE_ICON[state.save])}<span>${h(t(`header.save.${state.save}`))}</span></span>
    <span class="spacer"></span>
    <div class="history" role="group" aria-label="${h(t('header.history'))}">
      <button type="button" class="icon-btn" data-action="undo" ${state.past.length ? '' : 'disabled'} aria-label="${h(t('header.undo'))}" title="${h(t('header.undoHint'))}">${icon('undo')}</button>
      <button type="button" class="icon-btn" data-action="redo" ${state.future.length ? '' : 'disabled'} aria-label="${h(t('header.redo'))}" title="${h(t('header.redoHint'))}">${icon('redo')}</button>
    </div>
    <button type="button" class="btn btn-primary btn-generate" data-action="generate" ${generating ? 'disabled aria-busy="true"' : ''}>
      ${generating ? '<span class="spinner" aria-hidden="true"></span>' : icon('shuffle')}
      <span>${h(t(generating ? 'header.generating' : doc.plan ? 'header.generateAnother' : 'header.generate'))}</span>
    </button>`;
}

// ---------- Workspace ----------

function workspaceShell() {
  return `<div class="workspace">
    <section class="stage" aria-label="${h(t('stage.label'))}">
      <div id="demo-banner"></div>
      <div class="stage-bar" id="stage-bar"></div>
      <div id="notices" class="notices"></div>
      <div class="chart-scroll" id="chart"></div>
      <div id="tray"></div>
      <div id="inspector"></div>
    </section>
    <aside class="sidebar" aria-label="${h(t('sidebar.label'))}">
      <div class="tabs" role="tablist" id="tabs"></div>
      <div class="tab-panel" id="tab-panel" role="tabpanel"></div>
    </aside>
  </div>`;
}

const TABS = ['students', 'rules', 'saved'];

function tabsHTML(v) {
  const counts = { students: v.doc.students.length, rules: v.doc.rules.length, saved: v.doc.saved.length };
  return TABS.map(
    (tab) => `<button type="button" role="tab" id="tab-${tab}" class="tab" data-action="tab" data-tab="${tab}"
      aria-selected="${state.ui.tab === tab}" aria-controls="tab-panel" tabindex="${state.ui.tab === tab ? 0 : -1}">
      ${h(t(`sidebar.${tab}`))}<span class="tab-count">${counts[tab]}</span></button>`,
  ).join('');
}

function panelHTML(v) {
  if (state.ui.tab === 'rules') return rulesPanelHTML(v);
  if (state.ui.tab === 'saved') return savedPanelHTML(v);
  return studentsPanelHTML(v);
}

function emptyChartHint(v) {
  if (v.doc.plan || state.ui.editingLayout) return '';
  const key = !v.doc.students.length ? 'stage.hintNoStudents' : v.includedCount > v.usableSeats ? 'stage.hintTooMany' : 'stage.hintReady';
  return `<p class="stage-hint">${icon('info')}<span>${h(t(key, { count: v.includedCount }))}</span></p>`;
}

// ---------- Render ----------

let shellFor = null; // 'welcome' | 'workspace'

function render() {
  patch($('topbar'), headerHTML());
  const main = $('main');
  if (!state.doc) {
    if (shellFor !== 'welcome') {
      main.innerHTML = welcomeHTML();
      shellFor = 'welcome';
    } else patch(main, welcomeHTML());
    document.title = t('app.name');
    return;
  }
  if (shellFor !== 'workspace') {
    main.innerHTML = workspaceShell();
    shellFor = 'workspace';
  }
  document.title = `${state.doc.name} · ${t('app.name')}`;
  const v = view();
  const layout = state.ui.editingLayout;
  main.querySelector('.workspace').classList.toggle('is-layout', layout);
  patch($('demo-banner'), demoBannerHTML());
  patch($('stage-bar'), layout ? layoutBarHTML(v) : stageBarHTML(v));
  patch($('notices'), layout ? '' : noticesHTML(v) + emptyChartHint(v));
  patch($('chart'), chartHTML(v, { mode: layout ? 'layout' : 'plan', selection: state.ui.selection }));
  patch($('tray'), layout ? '' : trayHTML(v));
  patch($('inspector'), layout ? layoutInspectorHTML(v) : inspectorHTML(v));
  patch($('tabs'), tabsHTML(v));
  patch($('tab-panel'), panelHTML(v));
}

// ---------- Global actions ----------

onClick({
  undo: () => undo(),
  redo: () => redo(),
  tab: (el) => {
    state.ui.tab = el.dataset.tab;
    notify();
    $(`tab-${el.dataset.tab}`)?.focus();
  },
});

function onKeydown(e) {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  const mod = e.ctrlKey || e.metaKey;
  if (!state.doc || dialogIsOpen()) return;
  if (mod && !typing && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (mod && !typing && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
  } else if (e.key === 'Escape' && state.ui.selection) {
    state.ui.selection = null;
    notify();
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target.matches?.('[role=tab]')) {
    const i = TABS.indexOf(state.ui.tab);
    state.ui.tab = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    notify();
    $(`tab-${state.ui.tab}`)?.focus();
  }
}

function onDrop(source, target) {
  if (!state.doc) return;
  if (source.kind === 'student' && target.dataset.drop === 'seat' && !state.ui.editingLayout) {
    state.ui.selection = null;
    moveStudent(source.id, target.dataset.seat);
  } else if (source.kind === 'seat' && state.ui.editingLayout) {
    dropSeat(source.id, target);
  }
}

// ---------- Start ----------

async function start() {
  installEventDelegation();
  installDialog();
  installDrag(onDrop);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', () => flushSave());
  subscribe(render);

  try {
    localStorage.setItem('classshuffle.check', '1');
    localStorage.removeItem('classshuffle.check');
  } catch {
    toast(t('app.storageUnavailable'), { kind: 'error' });
  }
  await loadIndex();
  // ?demo opens the demo classroom directly (used by the portfolio site's "Ver demo" link).
  if (new URLSearchParams(location.search).has('demo')) return openDemo();
  const last = lastOpened();
  if (!(last && (await openClassroom(last)))) render();
}

start();
