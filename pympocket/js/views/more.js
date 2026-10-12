// Más: plan, moneda de referencia, recordatorios, datos (exportar/importar/respaldos), privacidad.
import { LANGUAGES, language, t, tRaw } from '../i18n.js';
import { THEMES, setTheme, theme } from '../theme.js';
import { APP_URL, DEMO_ONLY } from '../config.js';
import { h } from '../util.js';
import { state, exportAll, importAll, listBackups, saveMany, setSetting } from '../store.js';
import { currentUser, updatePassword } from '../auth.js';
import { syncStatus } from '../sync.js';
import { biometricAvailable, biometricEnabled, disableBiometric } from '../lock.js';
import { authErrorText } from './auth.js';
import { formatDate, formatDateTime, money, todayISO } from '../format.js';
import { SOURCES, activeSource, ensureRates, isProSource, latestRate, refreshRates, sourceAllowed } from '../rates.js';
import { can, isPro, FREE_HISTORY_MONTHS } from '../plan.js';
import { requestNotifications } from '../habits.js';
import { analyzeImport, movementsCSV } from '../csv.js';
import { processRecurring } from '../recurring.js';
import { closeDialog, confirmDialog, download, onChange, onClick, onSubmit, openDialog, pickTextFile, toast } from '../ui.js';
import { currencyOptions, icon, pageHeader } from './common.js';

let backups = [];
let canBiometric = false;
let rerender = () => {};
let pendingImport = null;

export const title = () => t('nav.more');

export function render() {
  const s = state.settings;
  const r = s.reminder;
  const weekdays = tRaw('common.weekdays');
  const notifState = 'Notification' in window ? Notification.permission : 'unsupported';
  return `${pageHeader(t('more.title'))}
    ${accountSection()}
    ${appearanceSection()}
    <nav class="card link-list" aria-label="${h(t('more.manage'))}">
      <a href="#/categorias">${icon('tag')}<span>${h(t('nav.categories'))}</span>${icon('chevron-right')}</a>
      <a href="#/recurrentes">${icon('repeat')}<span>${h(t('nav.recurring'))}</span>${!can('recurring') ? `<span class="pro-badge">${h(t('plan.proBadge'))}</span>` : ''}${icon('chevron-right')}</a>
      <a href="#/presupuestos" class="hide-desktop">${icon('wallet')}<span>${h(t('nav.budgets'))}</span>${!can('budgets') ? `<span class="pro-badge">${h(t('plan.proBadge'))}</span>` : ''}${icon('chevron-right')}</a>
      <a href="#/metas" class="hide-desktop">${icon('target')}<span>${h(t('nav.goals'))}</span>${!can('goals') ? `<span class="pro-badge">${h(t('plan.proBadge'))}</span>` : ''}${icon('chevron-right')}</a>
      <a href="#/papelera">${icon('trash')}<span>${h(t('nav.trash'))}</span>${icon('chevron-right')}</a>
    </nav>

    <section class="card" id="plan" aria-labelledby="more-plan">
      <div class="card-head"><h2 id="more-plan">${h(t('plan.title'))}</h2><span class="tag ${isPro() ? 'tag-pro' : ''}">${h(t(isPro() ? 'plan.pro' : 'plan.free'))}</span></div>
      <div class="plans">
        <div class="plan-col"><h3>${h(t('plan.free'))}</h3><ul class="checks">${tRaw('plan.freeList').map((x) => `<li>${h(x.replace('{months}', FREE_HISTORY_MONTHS))}</li>`).join('')}</ul></div>
        <div class="plan-col plan-pro"><h3>${h(t('plan.pro'))} <span class="muted small">${h(t('plan.monthly'))}</span></h3><ul class="checks">${tRaw('plan.proList').map((x) => `<li>${h(x)}</li>`).join('')}</ul></div>
      </div>
      <p class="muted small">${h(t('plan.demoNote'))}</p>
      <button type="button" class="btn ${isPro() ? 'btn-ghost' : 'btn-primary'}" data-action="toggle-plan">${h(t(isPro() ? 'plan.backToFree' : 'plan.tryPro'))}</button>
    </section>

    <section class="card" id="moneda" aria-labelledby="more-currency">
      <h2 id="more-currency">${h(t('more.currencyTitle'))}</h2>
      <p class="muted small">${h(t('more.currencyHint'))}</p>
      <label class="inline-field">${h(t('more.refCurrency'))}
        <select data-change="ref-currency">${currencyOptions(s.refCurrency, { includeNone: true })}</select></label>
      <label class="inline-field">${h(t('rates.sourceLabel'))}
        <select data-change="rate-source">${SOURCES.map(
          (src) => `<option value="${src}" ${src === activeSource() ? 'selected' : ''} ${sourceAllowed(src) ? '' : 'disabled'}>${h(t(`rates.sources.${src}`))}${isProSource(src) && !sourceAllowed(src) ? ' (Pro)' : ''}</option>`,
        ).join('')}</select></label>
      <p class="muted small">${h(t('rates.sourceHint'))}</p>
      <h3>${h(t('rates.today'))}</h3>
      <ul class="rate-list">${SOURCES.map((src) => {
        const r = latestRate(src);
        return `<li class="${src === activeSource() ? 'is-active' : ''}">
          <span>${h(t(`rates.sources.${src}`))}${isProSource(src) && !isPro() ? ` <span class="pro-badge">${h(t('plan.proBadge'))}</span>` : ''}</span>
          <strong>${r ? h(money(r.USD, 'ARS')) : `<span class="muted">${h(t('rates.unavailable'))}</span>`}</strong>
          <span class="muted small">${r ? h(formatDate(r.date)) : ''}</span>
        </li>`;
      }).join('')}</ul>
      <p class="muted small">${h(t('rates.credits'))}</p>
      <button type="button" class="btn btn-ghost btn-small" data-action="refresh-rates">${icon('repeat')} ${h(t('rates.refresh'))}</button>
    </section>

    <section class="card" aria-labelledby="more-reminders">
      <h2 id="more-reminders">${h(t('reminders.title'))}</h2>
      <form data-form="reminders" class="stack">
        <label class="check"><input type="checkbox" name="enabled" ${r.enabled ? 'checked' : ''}> ${h(t('reminders.enable'))}</label>
        <div class="grid-3">
          <label>${h(t('reminders.frequency'))}<select name="frequency">
            <option value="daily" ${r.frequency === 'daily' ? 'selected' : ''}>${h(t('reminders.daily'))}</option>
            <option value="weekly" ${r.frequency === 'weekly' ? 'selected' : ''}>${h(t('reminders.weekly'))}</option></select></label>
          <label>${h(t('reminders.weekday'))}<select name="weekday">${weekdays.map((d, i) => `<option value="${i}" ${Number(r.weekday) === i ? 'selected' : ''}>${h(d)}</option>`).join('')}</select></label>
          <label>${h(t('reminders.time'))}<input type="time" name="time" value="${h(r.time)}"></label>
        </div>
        ${notifState === 'default' ? `<button type="button" class="btn btn-ghost btn-small" data-action="allow-notifications">${icon('bell')} ${h(t('reminders.allow'))}</button>` : ''}
        ${notifState === 'denied' ? `<p class="muted small">${h(t('reminders.denied'))}</p>` : ''}
        <p class="muted small">${h(t('reminders.hint'))}</p>
        <label>${h(t('summary.label'))} ${!can('insights') ? `<span class="pro-badge">${h(t('plan.proBadge'))}</span>` : ''}
          <select name="summary" ${can('insights') ? '' : 'disabled'}>
            ${['off', 'weekly', 'monthly'].map((k) => `<option value="${k}" ${s.summary === k ? 'selected' : ''}>${h(t(`summary.options.${k}`))}</option>`).join('')}
          </select></label>
        <button class="btn btn-primary">${h(t('common.save'))}</button>
      </form>
    </section>

    <section class="card" id="datos" aria-labelledby="more-data">
      <h2 id="more-data">${h(t('data.title'))}</h2>
      <p class="muted small">${h(t('data.hint'))}</p>
      <div class="button-grid">
        <button type="button" class="btn btn-ghost" data-action="export-csv">${icon('download')} ${h(t('data.exportCsv'))}</button>
        <button type="button" class="btn btn-ghost" data-action="export-json">${icon('download')} ${h(t('data.exportJson'))}</button>
        <button type="button" class="btn btn-ghost" data-action="import-csv">${icon('upload')} ${h(t('data.importCsv'))} ${!can('csvImport') ? `<span class="pro-badge">${h(t('plan.proBadge'))}</span>` : ''}</button>
        <button type="button" class="btn btn-ghost" data-action="import-json">${icon('upload')} ${h(t('data.importJson'))}</button>
      </div>
      <h3>${h(t('data.backups'))}</h3>
      <p class="muted small">${h(t('data.backupsHint'))}</p>
      ${backups.length ? `<ul class="rows">${backups
        .map(
          (b) => `<li><div class="row row-static"><span class="row-main"><span class="row-title">${h(formatDateTime(b.createdAt))}</span>
            <span class="row-meta">${h(t('data.backupCount', { n: b.dump.data.movements.length }))}</span></span>
            <button type="button" class="btn btn-small btn-ghost" data-action="restore-backup" data-id="${h(b.id)}">${h(t('data.restore'))}</button></div></li>`,
        )
        .join('')}</ul>` : `<p class="small">${h(t('data.noBackups'))}</p>`}
    </section>

    <section class="card" aria-labelledby="more-privacy">
      <h2 id="more-privacy">${h(t('privacy.title'))}</h2>
      <ul class="checks">${tRaw('privacy.points').map((p) => `<li>${h(p)}</li>`).join('')}</ul>
      <button type="button" class="btn btn-danger-ghost" data-action="wipe-account-data">${icon('trash')} ${h(t('privacy.wipe'))}</button>
    </section>

    <p class="muted small center">PymPocket · ${h(t('more.version'))} 2.2.1 · PyM Technologies</p>`;
}

let ratesRequested = false;

export function bind(root, refresh) {
  rerender = refresh;
  // Las cotizaciones de hoy de todas las fuentes, una vez por sesión.
  if (!ratesRequested) {
    ratesRequested = true;
    ensureRates(SOURCES).then((changed) => changed && refresh());
  }
  biometricAvailable().then((ok) => {
    if (ok !== canBiometric) {
      canBiometric = ok;
      refresh();
    }
  });
  listBackups().then((list) => {
    const changed = list.length !== backups.length || list[0]?.id !== backups[0]?.id;
    backups = list;
    if (changed) refresh();
  });
  const anchor = location.hash.split('#')[2];
  if (anchor) root.querySelector(`#${CSS.escape(anchor)}`)?.scrollIntoView({ block: 'start' });
}

onChange({
  'ref-currency': async (el) => {
    await setSetting('refCurrency', el.value || null);
    if (el.value) ensureRates().then((changed) => changed && rerender());
  },
  'rate-source': async (el) => {
    await setSetting('rateSource', el.value);
    ensureRates([el.value]).then((changed) => changed && rerender());
  },
});

onSubmit({
  reminders: async (data) => {
    await setSetting('reminder', {
      enabled: data.get('enabled') === 'on',
      frequency: data.get('frequency'),
      weekday: Number(data.get('weekday')),
      time: data.get('time') || '21:00',
    });
    if (data.get('summary')) await setSetting('summary', data.get('summary'));
    if (data.get('enabled') === 'on' && 'Notification' in window && Notification.permission === 'default') await requestNotifications();
    toast(t('reminders.saved'), { tone: 'success' });
  },
  'confirm-import': async () => {
    const { movements, newCategories } = pendingImport;
    if (newCategories.length) await saveMany('categories', newCategories);
    await saveMany('movements', movements);
    closeDialog();
    toast(t('data.imported', { n: movements.length }), { tone: 'success' });
    pendingImport = null;
  },
});

onClick({
  'toggle-plan': async () => {
    await setSetting('plan', isPro() ? 'free' : 'pro');
    if (isPro()) await processRecurring();
    toast(t(isPro() ? 'plan.proOn' : 'plan.proOff'), { tone: 'success' });
  },
  'refresh-rates': async () => {
    if (!navigator.onLine) return toast(t('rates.offline'));
    try {
      await refreshRates({ force: true });
      await ensureRates(SOURCES, { force: true });
      rerender();
      const rate = latestRate();
      toast(rate ? t('rates.updated', { date: formatDate(rate.date) }) : t('rates.offline'));
    } catch {
      toast(t('rates.error'), { tone: 'danger' });
    }
  },
  'allow-notifications': async () => {
    await requestNotifications();
    rerender();
  },
  'export-csv': () => download(`pympocket-${todayISO()}.csv`, movementsCSV(), 'text/csv;charset=utf-8'),
  'export-json': () => download(`pympocket-copia-${todayISO()}.json`, JSON.stringify(exportAll(), null, 2), 'application/json'),
  'import-csv': async () => {
    if (!can('csvImport')) {
      toast(t('plan.proOnly'), { action: t('plan.seePlans'), onAction: () => document.getElementById('plan')?.scrollIntoView() });
      return;
    }
    const text = await pickTextFile('.csv,text/csv');
    if (!text) return;
    pendingImport = analyzeImport(text);
    openDialog(importPreview(pendingImport));
  },
  'import-json': async () => {
    const text = await pickTextFile('.json,application/json');
    if (!text) return;
    try {
      const dump = JSON.parse(text);
      if (!(await confirmDialog(t('data.restoreConfirm'), { confirm: t('data.restore'), danger: true }))) return;
      await importAll(dump);
      toast(t('data.restored'), { tone: 'success' });
    } catch {
      toast(t('data.invalidFile'), { tone: 'danger' });
    }
  },
  'restore-backup': async (el) => {
    const b = backups.find((x) => x.id === el.dataset.id);
    if (!b || !(await confirmDialog(t('data.restoreConfirm'), { confirm: t('data.restore'), danger: true }))) return;
    await importAll(b.dump);
    toast(t('data.restored'), { tone: 'success' });
  },
});

// ---------- Apariencia e idioma ----------

function appearanceSection() {
  const current = theme();
  return `<section class="card" id="apariencia" aria-labelledby="more-appearance">
    <h2 id="more-appearance">${h(t('appearance.title'))}</h2>
    <div class="stack">
      <div class="field-group" role="group" aria-labelledby="theme-label">
        <span id="theme-label" class="field-label">${h(t('appearance.theme'))}</span>
        <div class="segmented segmented-wrap">
          ${THEMES.map((k) => `<button type="button" data-action="set-theme" data-theme="${k}" aria-pressed="${k === current}">${icon(k === 'dark' ? 'moon' : k === 'light' ? 'sun' : 'contrast')} ${h(t(`appearance.themes.${k}`))}</button>`).join('')}
        </div>
        <p class="muted small" id="theme-hint">${h(t('appearance.themeHint'))}</p>
      </div>
      <label class="inline-field">${h(t('appearance.language'))}
        <select data-change="set-language">
          ${LANGUAGES.map((l) => `<option value="${l.code}" lang="${l.code}" ${l.code === language() ? 'selected' : ''}>${h(l.name)}</option>`).join('')}
        </select></label>
      <p class="muted small">${h(t('appearance.languageHint'))}</p>
    </div>
  </section>`;
}

onClick({
  'set-theme': (el) => {
    setTheme(el.dataset.theme);
    rerender();
  },
});

// ---------- Tu cuenta ----------

function accountSection() {
  const user = currentUser();
  if (!user) {
    return `<section class="card card-accent" aria-labelledby="more-account">
      <h2 id="more-account">${h(t('account.demoTitle'))}</h2>
      <p>${h(t('account.demoText'))}</p>
      ${DEMO_ONLY
        ? `<div class="button-grid">
            <a class="btn btn-primary" href="${h(APP_URL)}" target="_blank" rel="noopener">${h(t('demo.createAccount'))}</a>
            <button type="button" class="btn btn-ghost" data-action="reset-demo">${icon('repeat')} ${h(t('demo.reset'))}</button>
          </div>`
        : `<button type="button" class="btn btn-primary" data-action="exit-demo">${h(t('demo.exit'))}</button>`}
    </section>`;
  }
  const sync = syncStatus();
  const syncState = sync.state === 'idle' ? 'synced' : sync.state;
  return `<section class="card" id="cuenta" aria-labelledby="more-account">
    <h2 id="more-account">${h(t('account.title'))}</h2>
    <p class="account-email">${icon('user')} <strong>${h(user.email)}</strong></p>
    <p class="small sync-line" data-state="${syncState}">${icon(syncState === 'offline' || syncState === 'error' ? 'cloud-off' : 'cloud')}
      ${h(t(`sync.state.${syncState}`))}${sync.pending ? ` · ${h(t('sync.pendingCount', { n: sync.pending }))}` : ''}
      ${sync.lastSync ? `<span class="muted"> · ${h(t('sync.lastSync', { date: formatDateTime(sync.lastSync) }))}</span>` : ''}</p>
    <div class="button-grid">
      <button type="button" class="btn btn-ghost" data-action="sync-now">${icon('repeat')} ${h(t('sync.syncNow'))}</button>
      ${canBiometric
        ? biometricEnabled()
          ? `<button type="button" class="btn btn-ghost" data-action="disable-biometric">${icon('fingerprint')} ${h(t('lock.disable'))}</button>`
          : `<button type="button" class="btn btn-ghost" data-action="enable-biometric">${icon('fingerprint')} ${h(t('lock.enable'))}</button>`
        : ''}
      <button type="button" class="btn btn-ghost" data-action="change-password">${icon('edit')} ${h(t('account.changePassword'))}</button>
      <button type="button" class="btn btn-ghost" data-action="sign-out">${icon('logout')} ${h(t('account.signOut'))}</button>
    </div>
    ${canBiometric ? `<p class="muted small">${h(t(biometricEnabled() ? 'lock.enabledHint' : 'lock.offerText'))}</p>` : ''}
    <details class="danger-zone">
      <summary>${h(t('account.dangerZone'))}</summary>
      <p class="small">${h(t('account.deleteText'))}</p>
      <button type="button" class="btn btn-danger-ghost" data-action="delete-account">${icon('trash')} ${h(t('account.delete'))}</button>
    </details>
  </section>`;
}

onClick({
  'disable-biometric': () => {
    disableBiometric();
    toast(t('lock.disabled'));
    rerender();
  },
  'change-password': () =>
    openDialog(`<form class="sheet sheet-small" data-form="change-password" novalidate>
      <header class="sheet-header"><h2>${h(t('account.changePassword'))}</h2>
        <button type="button" class="btn-icon" data-action="close-dialog" aria-label="${h(t('common.close'))}">${icon('close')}</button></header>
      <input type="email" name="email" autocomplete="username" value="${h(currentUser()?.email ?? '')}" hidden>
      <label>${h(t('auth.newPassword'))}<input type="password" name="password" autocomplete="new-password" minlength="8" required autofocus></label>
      <label>${h(t('auth.confirmPassword'))}<input type="password" name="confirm" autocomplete="new-password" minlength="8" required></label>
      <p class="muted small">${h(t('auth.passwordHint', { n: 8 }))}</p>
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions"><button class="btn btn-primary btn-wide">${h(t('auth.savePassword'))}</button></div>
    </form>`),
});

onSubmit({
  'change-password': async (data, form) => {
    const error = form.querySelector('.form-error');
    const password = data.get('password');
    if (password.length < 8) return (error.textContent = t('auth.errors.weak', { n: 8 }));
    if (password !== data.get('confirm')) return (error.textContent = t('auth.errors.mismatch'));
    try {
      await updatePassword(password);
      closeDialog();
      toast(t('auth.passwordUpdated'), { tone: 'success' });
    } catch (err) {
      error.textContent = authErrorText(err);
    }
  },
});

function importPreview({ movements, newCategories, errors }) {
  return `<form class="sheet" data-form="confirm-import">
    <header class="sheet-header"><h2>${h(t('data.importTitle'))}</h2>
      <button type="button" class="btn-icon" data-action="close-dialog" aria-label="${h(t('common.close'))}">${icon('close')}</button></header>
    <p>${h(t('data.importReady', { n: movements.length }))}</p>
    ${newCategories.length ? `<p class="small">${h(t('data.importNewCats', { list: newCategories.map((c) => c.name).join(', ') }))}</p>` : ''}
    ${errors.length ? `<details><summary>${h(t('data.importErrors', { n: errors.length }))}</summary>
      <ul class="small">${errors.slice(0, 50).map((e) => `<li>${h(t('data.line', { n: e.line }))}: ${h(e.message)}</li>`).join('')}</ul></details>` : ''}
    <p class="muted small">${h(t('data.importFormat'))}</p>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" data-action="close-dialog">${h(t('common.cancel'))}</button>
      <button class="btn btn-primary" ${movements.length ? '' : 'disabled'}>${h(t('data.importConfirm', { n: movements.length }))}</button>
    </div>
  </form>`;
}

