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
import { ensureRates, initRates, refreshRates } from './rates.js';
import { processRecurring } from './recurring.js';
import { notifyIfDue } from './habits.js';
import { formatDateTime } from './format.js';
import { closeDialog, confirmDialog, installEventDelegation, onClick, onSubmit, openDialog, toast } from './ui.js';
import { PALETTE } from './defaults.js';
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
  renderAccountButton();
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

// ---------- Cuentas (como Instagram) ----------

const SWITCHED_KEY = 'pympocket.switchedTo';

/** Color fijo por cuenta, para distinguirlas de un vistazo. */
function avatar(account, size = '') {
  let hash = 0;
  for (const ch of account.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = PALETTE[hash % PALETTE.length];
  return `<span class="avatar ${size}" style="--avatar:${h(color)}" aria-hidden="true">${h(auth.accountLabel(account).charAt(0).toUpperCase())}</span>`;
}

function renderAccountButton() {
  const btn = document.getElementById('account-btn');
  const user = auth.currentUser();
  if (!user || localStorage.getItem(MODE_KEY) === 'demo') {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  btn.innerHTML = `${avatar(user)}<span class="account-email">${h(auth.accountLabel(user))}</span>${icon('chevron-down')}`;
  btn.setAttribute('aria-label', t('accounts.menuLabel', { name: auth.accountLabel(user) }));
  btn.title = user.email;
}

function openAccountMenu() {
  const accounts = auth.listAccounts();
  openDialog(`<div class="sheet sheet-small">
    <header class="sheet-header"><h2>${h(t('accounts.title'))}</h2>
      <button type="button" class="btn-icon" data-action="close-dialog" aria-label="${h(t('common.close'))}">${icon('close')}</button></header>
    <ul class="account-list">${accounts
      .map(
        (a) => `<li><button type="button" class="account-row" data-action="switch-account" data-id="${h(a.id)}" ${a.active ? 'aria-current="true"' : ''}>
          ${avatar(a, 'avatar-lg')}<span class="account-row-text"><span class="account-row-email">${h(auth.accountLabel(a))}</span>${a.name ? `<span class="account-row-sub">${h(a.email)}</span>` : ''}</span>
          ${a.active ? `<span class="account-active">${icon('check')} ${h(t('accounts.active'))}</span>` : ''}
        </button></li>`,
      )
      .join('')}</ul>
    ${accounts.length < auth.MAX_ACCOUNTS
      ? `<button type="button" class="btn btn-ghost" data-action="add-account">${icon('plus')} ${h(t('accounts.add'))}</button>`
      : `<p class="muted small">${h(t('accounts.limit', { n: auth.MAX_ACCOUNTS }))}</p>`}
    <button type="button" class="link-btn" data-action="manage-account">${h(t('accounts.manage'))}</button>
    <p class="muted small">${h(t('accounts.hint'))}</p>
  </div>`);
}

// ---------- Nombre de la cuenta ----------

const NAME_ASKED_KEY = 'pympocket.nameAsked';

function nameForm({ required = false } = {}) {
  const [first = '', ...rest] = (auth.currentUser()?.name ?? '').split(' ');
  openDialog(`<form class="sheet sheet-small" data-form="profile-name" novalidate>
    <header class="sheet-header"><h2>${h(t('profile.title'))}</h2>
      <button type="button" class="btn-icon" data-action="close-dialog" aria-label="${h(t('common.close'))}">${icon('close')}</button></header>
    <p class="muted">${h(t('profile.text'))}</p>
    <div class="grid-2">
      <label>${h(t('auth.firstName'))}<input name="firstName" autocomplete="given-name" maxlength="50" required autofocus value="${h(first)}"></label>
      <label>${h(t('auth.lastName'))}<input name="lastName" autocomplete="family-name" maxlength="50" required value="${h(rest.join(' '))}"></label>
    </div>
    <p class="form-error" role="alert"></p>
    <div class="sheet-actions">
      ${required ? '' : `<button type="button" class="btn btn-ghost" data-action="close-dialog">${h(t('profile.later'))}</button>`}
      <button class="btn btn-primary">${h(t('common.save'))}</button>
    </div>
  </form>`);
}

/** Si la cuenta en uso no tiene nombre, lo pide (una vez por sesión del navegador). Devuelve si lo pidió. */
async function askNameIfMissing() {
  try {
    await auth.refreshProfile();
  } catch {}
  const user = auth.currentUser();
  const key = `${NAME_ASKED_KEY}.${user?.id}`;
  if (!user || user.name || sessionStorage.getItem(key)) return false;
  sessionStorage.setItem(key, '1');
  nameForm();
  return true;
}

onClick({ 'edit-name': () => nameForm() });

onSubmit({
  'profile-name': async (data, form) => {
    const error = form.querySelector('.form-error');
    const firstName = data.get('firstName').trim().replace(/\s+/g, ' ');
    const lastName = data.get('lastName').trim().replace(/\s+/g, ' ');
    if (!firstName || !lastName) return (error.textContent = t('auth.errors.name'));
    if (!navigator.onLine) return (error.textContent = t('profile.needsConnection'));
    form.querySelector('button.btn-primary').disabled = true;
    try {
      await auth.updateName(firstName, lastName);
      closeDialog();
      renderAccountButton();
      scheduleRender();
      toast(t('profile.saved'), { tone: 'success' });
    } catch (err) {
      error.textContent = authErrorText(err);
      form.querySelector('button.btn-primary').disabled = false;
    }
  },
});

/** Antes de cambiar de cuenta, intenta subir lo pendiente (sin esperar más de unos segundos). */
const flushQuickly = () => Promise.race([flush().catch(() => {}), sleep(3000)]);

/** Actualiza en segundo plano los historiales de cotización que hacen falta. */
const updateRates = () =>
  ensureRates()
    .then((changed) => changed && scheduleRender())
    .catch((err) => console.warn('No se pudieron actualizar las cotizaciones', err));

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
    addingFrom: auth.addingFrom(),
    onDone: () => {
      auth.clearAdding();
      startApp({ offerBiometric: true });
    },
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
    await initRates();
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
    const switched = sessionStorage.getItem(SWITCHED_KEY);
    if (switched) {
      sessionStorage.removeItem(SWITCHED_KEY);
      toast(t('accounts.switched', { name: switched }), { tone: 'success' });
    }
    onSyncStatus(renderSyncBadge);
    if (imported) toast(t('sync.imported', { n: imported }), { tone: 'success', timeout: 7000 });
    // Cuentas sin nombre (creadas antes de pedirlo): se ofrece completarlo.
    askNameIfMissing().then((asked) => {
      if (!asked && offer) offerBiometric();
    });
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
    updateRates();
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
  refreshRates()
    .then(() => scheduleRender())
    .catch((err) => console.warn('No se pudo actualizar la cotización', err));
  updateRates();
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
  'account-menu': () => openAccountMenu(),
  'manage-account': () => {
    closeDialog();
    location.hash = '#/mas#cuenta';
  },
  'switch-account': async (el) => {
    const target = auth.listAccounts().find((a) => a.id === el.dataset.id);
    if (!target || target.active) return closeDialog();
    await flushQuickly();
    auth.switchAccount(target.id);
    sessionStorage.setItem(SWITCHED_KEY, auth.accountLabel(target));
    reloadHome();
  },
  'add-account': async () => {
    if (auth.listAccounts().length >= auth.MAX_ACCOUNTS) return toast(t('accounts.limit', { n: auth.MAX_ACCOUNTS }));
    await flushQuickly();
    auth.beginAddAccount();
    reloadHome();
  },
  'cancel-add-account': () => {
    auth.cancelAddAccount();
    reloadHome();
  },
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
