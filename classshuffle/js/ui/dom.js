// Shared interface pieces: event delegation, dialogs, confirmations, toasts.
import { t } from '../i18n.js';
import { h, icon } from '../util.js';

// ---------- Event delegation ----------
// Elements declare data-action (click), data-form (submit), data-change or
// data-input; modules register handlers by name.

export const handlers = { click: {}, submit: {}, change: {}, input: {} };
export const onClick = (map) => Object.assign(handlers.click, map);
export const onSubmit = (map) => Object.assign(handlers.submit, map);
export const onChange = (map) => Object.assign(handlers.change, map);
export const onInput = (map) => Object.assign(handlers.input, map);

let suppressClickUntil = 0;
/** Ignores the click that browsers fire right after a drag ends. */
export const suppressNextClick = () => (suppressClickUntil = Date.now() + 350);

export function installEventDelegation() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    const fn = el && handlers.click[el.dataset.action];
    if (!fn || el.disabled) return;
    if (Date.now() < suppressClickUntil) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    const fn = form && handlers.submit[form.dataset.form];
    if (!fn) return;
    e.preventDefault();
    fn(new FormData(form), form, e);
  });
  for (const type of ['change', 'input']) {
    document.addEventListener(type, (e) => {
      const el = e.target.closest(`[data-${type}]`);
      const fn = el && handlers[type][el.dataset[type]];
      if (fn) fn(el, e);
    });
  }
}

// ---------- Re-rendering without losing focus ----------

/** @type {WeakMap<Element, string>} */
const rendered = new WeakMap();

/** Replaces `el`'s content, restoring focus to the equivalent element afterwards. */
export function patch(el, html) {
  // Compare with what we rendered last time (the browser's innerHTML is normalized differently).
  if (!el || rendered.get(el) === html) return;
  rendered.set(el, html);
  const active = document.activeElement;
  const key = active && el.contains(active) ? focusKey(active) : null;
  const caret = key && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  el.innerHTML = html;
  if (!key) return;
  const again = el.querySelector(key);
  if (!again) return;
  again.focus({ preventScroll: true });
  if (caret) try { again.setSelectionRange(...caret); } catch {}
}

function focusKey(node) {
  if (node.id) return `#${CSS.escape(node.id)}`;
  for (const attr of ['data-focus', 'data-seat', 'data-cell', 'data-id']) {
    const value = node.getAttribute(attr);
    if (value != null) {
      const action = node.dataset.action ? `[data-action="${CSS.escape(node.dataset.action)}"]` : '';
      return `[${attr}="${CSS.escape(value)}"]${action}`;
    }
  }
  return null;
}

// ---------- Dialog ----------

const dialog = () => /** @type {HTMLDialogElement} */ (document.getElementById('dialog'));
let returnFocus = null;
let closeCallback = null;

/** Opens the modal dialog with `html`. `onClose` runs once, however it closes. */
export function openDialog(html, { onClose, wide = false } = {}) {
  const dlg = dialog();
  if (dlg.open) finishClose();
  returnFocus = document.activeElement;
  closeCallback = onClose ?? null;
  dlg.className = `dialog${wide ? ' dialog-wide' : ''}`;
  dlg.innerHTML = html;
  dlg.showModal();
  const first = dlg.querySelector('[autofocus], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select, .btn-primary');
  first?.focus();
}

/** Replaces the open dialog's content (next step of the same dialog). */
export function replaceDialog(html) {
  const dlg = dialog();
  dlg.innerHTML = html;
  dlg.querySelector('[autofocus], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select, .btn-primary')?.focus();
}

export const dialogBody = () => dialog();
export const dialogIsOpen = () => dialog().open;

function finishClose() {
  const dlg = dialog();
  const callback = closeCallback;
  closeCallback = null;
  if (dlg.open) dlg.close();
  dlg.innerHTML = '';
  callback?.();
}

export function closeDialog() {
  finishClose();
  if (returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}

export function installDialog() {
  const dlg = dialog();
  // Esc: let us clean up instead of the browser closing it behind our back.
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog();
  });
  // Click on the backdrop closes.
  dlg.addEventListener('mousedown', (e) => {
    if (e.target === dlg) closeDialog();
  });
}

export const dialogHeader = (title, subtitle = '') => `
  <header class="dialog-head">
    <div>
      <h2 class="dialog-title">${title}</h2>
      ${subtitle ? `<p class="dialog-subtitle">${subtitle}</p>` : ''}
    </div>
    <button type="button" class="icon-btn" data-action="close-dialog" aria-label="${h(t('common.close'))}">${icon('x')}</button>
  </header>`;

/**
 * Confirmation for destructive actions. Resolves true if confirmed.
 * @param {{ title: string, body?: string, confirm: string, danger?: boolean }} options
 */
export function confirmDialog({ title, body = '', confirm, danger = true }) {
  return new Promise((resolve) => {
    let answer = false;
    openDialog(
      `<form data-form="confirm-dialog" class="dialog-form" role="alertdialog" aria-labelledby="confirm-title">
        <header class="dialog-head"><h2 class="dialog-title" id="confirm-title">${title}</h2></header>
        ${body ? `<div class="dialog-text">${body}</div>` : ''}
        <footer class="dialog-foot">
          <button type="button" class="btn btn-ghost" data-action="close-dialog">${h(t('common.cancel'))}</button>
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" autofocus>${h(confirm)}</button>
        </footer>
      </form>`,
      { onClose: () => resolve(answer) },
    );
    pendingConfirm = () => {
      answer = true;
      closeDialog();
    };
  });
}
let pendingConfirm = null;

onSubmit({ 'confirm-dialog': () => pendingConfirm?.() });
onClick({ 'close-dialog': () => closeDialog() });

// ---------- Toasts ----------

/**
 * Short message at the bottom of the screen.
 * @param {string} message
 * @param {{ kind?: 'info' | 'success' | 'warn' | 'error', action?: { label: string, run: () => void } }} [options]
 */
export function toast(message, { kind = 'info', action } = {}) {
  const region = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `${icon(kind === 'error' ? 'alert' : kind === 'warn' ? 'alert' : kind === 'success' ? 'check' : 'info')}
    <span class="toast-text">${h(message)}</span>`;
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      action.run();
      el.remove();
    });
    el.append(button);
  }
  region.append(el);
  while (region.children.length > 3) region.firstElementChild.remove();
  setTimeout(() => el.classList.add('toast-out'), action ? 7000 : 4500);
  setTimeout(() => el.remove(), action ? 7400 : 4900);
}
