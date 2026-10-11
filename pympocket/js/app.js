// Arranque: sesión → desbloqueo → base del usuario → sincronización → vistas.
// También maneja el modo demo (sin cuenta, para el portafolio) y el
// enrutamiento por URL (#/inicio, #/movimientos, ...).
import { t } from './i18n.js';
import { h } from './util.js';
import * as auth from './auth.js';
import { alive, housekeeping, importLegacy, load, subscribe, autoBackup, wipeLocal } from './store.js';
import { currentDatabase, deleteDatabase, useDatabase } from './db.js';
import { deleteRemoteData, flush, onSyncStatus, startSync, syncNow } from './sync.js';
import { disableBiometric, keepUnlocked, needsUnlock } from './lock.js';
import { refreshRates, latestRate } from './rates.js';
import { processRecurring } from './recurring.js';
import { notifyIfDue } from './habits.js';
import { formatDate, formatDateTime, formatDayMonth, money } from './format.js';
import { confirmDialog, installEventDelegation, onClick, toast } from './ui.js';
import { isDemo, loadDemo } from './demo.js';
import { APP_URL, DEMO_ONLY } from './config.js';
import { authErrorText, hideAuth, offerBiometric, showAuth, showLock } from './views/auth.js';
import * as home from './views/home.js';
import * as movements from './views/movements.js';
import * as analysis from './views/analysis.js';
import * as budgets from './views/budgets.js';
import * as goals from './views/goals.js';
import * as more from './views/more.js';
import * as categories from './views/categories.js';
import * as recurring from './views/recurring.js';
import * as trash from './views/trash.js';
import './views/movementForm.js';

const DEMO_DB = 'pympocket-demo';
const MODE_KEY = 'pympocket.mode';
const userDb = (user) => `pympocket-${user.id}`;

const routes = {
  inicio: home,
  movimientos: movements,
  analisis: analysis,
  presupuestos: budgets,
  metas: goals,
  mas: more,
  categorias: categories,
  recurrentes: recurring,
  papelera: trash,
};
// Sección del menú que se marca como activa para cada ruta.
const navParent = { categorias: 'mas', recurrentes: 'mas', papelera: 'mas' };

const main = document.getElementById('main');
let appStarted = false;

const routeName = () => {
  const name = location.hash.replace(/^#\/?/, '').split(/[?#]/)[0];
  return routes[name] ? name : 'inicio';
};

function render({ navigated = false } = {}) {
  if (!appStarted) return;
  const name = routeName();
  const view = routes[name];
  const active = document.activeElement;
  const focusId = !navigated && main.contains(active) ? active.id : null;
  const selection = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const scroll = window.scrollY;

  main.innerHTML = view.render();
  document.title = `${view.title()} · PymPocket`;
  for (const link of document.querySelectorAll('[data-nav]')) {
    const current = link.dataset.nav === (navParent[name] ?? name);
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  view.bind?.(main, () => render());
  renderRateBadge();
  renderDemoBanner();

  if (navigated) {
    if (!location.hash.split('#')[2]) window.scrollTo(0, 0);
    main.querySelector('h1')?.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, scroll);
    if (focusId) {
      const el = document.getElementById(focusId);
      el?.focus({ preventScroll: true });
      if (selection && el?.setSelectionRange) el.setSelectionRange(...selection);
    }
  }
}

function renderRateBadge() {
  const rate = latestRate();
  const badge = document.getElementById('rate-badge');
  badge.innerHTML = rate
    ? `<span class="sr-only">${h(t('rates.badgeLabel'))}</span>US$ 1 = ${h(money(rate.USD, 'ARS'))} <span class="muted">· ${h(formatDayMonth(rate.date))}</span>`
    : '';
  badge.title = rate ? t('rates.badgeTitle', { date: formatDate(rate.date) }) : '';
}

function renderSyncBadge(status) {
  const badge = document.getElementById('sync-badge');
  const state = status.state === 'idle' ? 'synced' : status.state;
  const label = t(`sync.state.${state}`);
  badge.hidden = false;
  badge.dataset.state = state;
  badge.innerHTML = `${icon(state === 'offline' || state === 'error' ? 'cloud-off' : 'cloud')}<span class="sync-label">${h(label)}</span>`;
  badge.setAttribute('aria-label', `${label}. ${t('sync.syncNow')}`);
  badge.title = status.lastSync ? t('sync.lastSync', { date: formatDateTime(status.lastSync) }) : label;
  if (routeName() === 'mas') scheduleRender(); // la sección "Tu cuenta" muestra el estado
}

const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

function renderDemoBanner() {
  const el = document.getElementById('demo-banner');
  const demo = localStorage.getItem(MODE_KEY) === 'demo' && isDemo();
  el.hidden = !demo;
  if (!demo) {
    el.innerHTML = '';
    return;
  }
  // En la copia del portafolio (solo demo) se invita a la app real en vez de abrir un login acá.
  el.innerHTML = DEMO_ONLY
    ? `<p><strong>${h(t('demo.bannerTitle'))}</strong> ${h(t('demo.onlyText'))}</p>
       <span class="demo-actions">
         <button type="button" class="btn btn-small btn-ghost" data-action="reset-demo">${h(t('demo.reset'))}</button>
         <a class="btn btn-small btn-primary" href="${h(APP_URL)}" target="_blank" rel="noopener">${h(t('demo.createAccount'))}</a>
       </span>`
    : `<p><strong>${h(t('demo.bannerTitle'))}</strong> ${h(t('demo.bannerText'))}</p>
       <button type="button" class="btn btn-small btn-primary" data-action="exit-demo">${h(t('demo.exit'))}</button>`;
}

let queued = false;
function scheduleRender() {
  if (queued) return;
  queued = true;
  setTimeout(() => {
    queued = false;
    render();
  });
}

function updateOnlineStatus() {
  document.getElementById('offline').hidden = navigator.onLine;
}

/** Traduce los textos fijos de index.html (atributos data-i18n). */
function translateStatic() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

// ---------- Pantalla de carga ----------

const SPLASH_MIN_MS = 900;
let splashGone = false;

/** Oculta la pantalla de carga con un fundido (después de un mínimo, para que no parpadee). */
async function hideSplash() {
  if (splashGone) return;
  splashGone = true;
  const wait = SPLASH_MIN_MS - performance.now();
  if (wait > 0) await sleep(wait);
  const el = document.getElementById('splash');
  el.classList.add('splash-hide');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 600); // por si no hay transición (movimiento reducido)
}

function storageError(err) {
  console.error(err);
  hideSplash();
  hideAuth();
  main.innerHTML = `<div class="card"><h1>${h(t('errors.storageTitle'))}</h1><p>${h(t('errors.storage'))}</p></div>`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Arranque ----------

async function start() {
  translateStatic();
  installEventDelegation();
  registerServiceWorker();

  // Link de demostración (por ejemplo, desde el portafolio): ?demo=1
  const params = new URLSearchParams(location.search);
  const wantsDemo = params.has('demo');
  if (wantsDemo) {
    params.delete('demo');
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
  }
  const inDemo = wantsDemo || localStorage.getItem(MODE_KEY) === 'demo';

  // Copia del portafolio: siempre demo, sin login ni conexión con cuentas.
  if (DEMO_ONLY) return startApp({ demo: true });

  if (!auth.isConfigured()) {
    if (inDemo) return startApp({ demo: true });
    hideSplash();
    return showAuth('notConfigured');
  }

  const { session, type, error } = await auth.init();
  if (session) {
    if (localStorage.getItem(MODE_KEY) === 'demo') await leaveDemoData();
    if (type === 'recovery') {
      hideSplash();
      return showAuth('newPassword', { onDone: () => startApp() });
    }
    if (type) return startApp({ offerBiometric: true }); // llegó desde el email de confirmación
    if (needsUnlock()) {
      await hideSplash();
      await showLock();
    }
    return startApp();
  }
  if (inDemo) return startApp({ demo: true });
  hideSplash();
  showAuth('login', {
    notice: error ? { tone: 'error', text: authErrorText({ code: error }) } : null,
    onDone: () => startApp({ offerBiometric: true }),
  });
}

/** Abre la base que corresponde (usuario o demo), sincroniza y muestra la app. */
async function startApp({ demo = false, offerBiometric: offer = false } = {}) {
  hideAuth();
  main.innerHTML = `<p class="loading">${h(t('common.loading'))}</p>`;
  let imported = 0;
  try {
    if (demo) {
      localStorage.setItem(MODE_KEY, 'demo');
      useDatabase(DEMO_DB);
      await load();
    } else {
      useDatabase(userDb(auth.currentUser()));
      await load();
      await startSync();
      imported = await importLegacy();
      // Primera sincronización antes de mostrar (sin esperar más de unos segundos).
      if (navigator.onLine) await Promise.race([syncNow(), sleep(6000)]);
    }
    await housekeeping();
    if (demo && !alive('movements').length) await loadDemo();
  } catch (err) {
    return storageError(err);
  }

  appStarted = true;
  render({ navigated: true });
  hideSplash();
  subscribe(scheduleRender);
  if (!demo) {
    onSyncStatus(renderSyncBadge);
    if (imported) toast(t('sync.imported', { n: imported }), { tone: 'success', timeout: 7000 });
    if (offer) offerBiometric();
    watchLock();
  }

  // Acceso directo "Cargar gasto" (ícono instalado o notificación).
  if (location.hash.includes('nuevo=1')) {
    history.replaceState(null, '', '#/inicio');
    document.getElementById('fab').click();
  }
  window.addEventListener('hashchange', () => render({ navigated: true }));
  window.addEventListener('online', () => {
    updateOnlineStatus();
    refreshRates().catch(() => {});
  });
  window.addEventListener('offline', updateOnlineStatus);
  // Los gráficos se dibujan según el ancho de pantalla (por ejemplo, al girar el celular).
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastWidth) < 40) return;
    lastWidth = window.innerWidth;
    scheduleRender();
  });
  updateOnlineStatus();

  const created = await processRecurring();
  if (created) toast(t('recurring.autoCreated', { n: created }), { tone: 'success' });
  refreshRates().catch((err) => console.warn('No se pudo actualizar la cotización', err));
  autoBackup().catch((err) => console.warn('No se pudo crear la copia automática', err));
  navigator.storage?.persist?.();

  const tick = async () => {
    if (await notifyIfDue()) scheduleRender();
  };
  tick();
  setInterval(tick, 60000);
  // Al volver a la app (por ejemplo, al día siguiente) se procesan recurrentes.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    await processRecurring();
    tick();
    scheduleRender();
  });
}

/** Vuelve a pedir huella/rostro si la app estuvo más de 5 minutos en segundo plano. */
function watchLock() {
  setInterval(() => {
    if (document.visibilityState === 'visible' && !document.body.classList.contains('locked')) keepUnlocked();
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && needsUnlock() && !document.body.classList.contains('locked')) showLock();
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker', err));
  }
}

async function leaveDemoData() {
  localStorage.removeItem(MODE_KEY);
  await deleteDatabase(DEMO_DB);
}

const reloadHome = () => {
  history.replaceState(null, '', `${location.pathname}#/inicio`);
  location.reload();
};

// ---------- Acciones de cuenta ----------

onClick({
  'sync-now': () => syncNow(),
  'reset-demo': async () => {
    if (!(await confirmDialog(t('demo.resetConfirm'), { confirm: t('demo.reset') }))) return;
    await wipeLocal();
    await loadDemo();
    location.hash = '#/inicio';
    toast(t('demo.resetDone'), { tone: 'success' });
  },
  'exit-demo': async () => {
    await leaveDemoData();
    reloadHome();
  },
  'sign-out': async () => {
    const user = auth.currentUser();
    if (!user) return reloadHome();
    // Si la app todavía no abrió la base (por ejemplo, desde la pantalla de desbloqueo), se abre para no perder cambios.
    if (!appStarted) {
      useDatabase(userDb(user));
      await load();
      await startSync();
    }
    const left = await flush();
    const ok = await confirmDialog(left ? t('account.signOutPending', { n: left }) : t('account.signOutConfirm'), {
      confirm: t('account.signOut'),
      danger: left > 0,
    });
    if (!ok) return;
    disableBiometric();
    await auth.signOut();
    await deleteDatabase(currentDatabase() ?? userDb(user));
    sessionStorage.clear();
    reloadHome();
  },
  'wipe-account-data': async () => {
    if (!(await confirmDialog(t('privacy.wipeConfirm'), { confirm: t('privacy.wipe'), danger: true }))) return;
    try {
      if (!isDemo()) await deleteRemoteData();
      await wipeLocal();
      toast(t('privacy.wiped'));
    } catch (err) {
      toast(authErrorText(err), { tone: 'danger' });
    }
  },
  'delete-account': async () => {
    if (!(await confirmDialog(t('account.deleteConfirm'), { confirm: t('account.delete'), danger: true, title: t('account.deleteTitle') }))) return;
    try {
      const dbName = currentDatabase();
      disableBiometric();
      await auth.deleteAccount();
      await deleteDatabase(dbName);
      sessionStorage.clear();
      reloadHome();
    } catch (err) {
      toast(authErrorText(err), { tone: 'danger' });
    }
  },
});

// Si se abre un link de un email (confirmación o recuperación) con la app ya
// abierta en esta pestaña, se recarga para procesarlo.
window.addEventListener('hashchange', () => {
  if (/[#&](access_token|error)=/.test(location.hash)) location.reload();
});

// Atajo de teclado: "n" abre la carga rápida.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!appStarted || document.body.classList.contains('locked')) return;
  if (e.target.closest('input, textarea, select, [contenteditable]') || document.getElementById('dialog').open) return;
  e.preventDefault();
  document.getElementById('fab').click();
});

// Resguardo: si algo inesperado frena el arranque, no queda la pantalla de carga para siempre.
setTimeout(hideSplash, 8000);
start();
