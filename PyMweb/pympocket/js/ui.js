// Piezas de interfaz compartidas: eventos, diálogos, avisos y descargas.
import { t } from './i18n.js';
import { h } from './util.js';

// ---------- Registro de eventos (delegación) ----------
// Los elementos declaran data-action (click), data-form (submit),
// data-change (change) o data-input (input) y los módulos registran handlers.

export const handlers = { click: {}, submit: {}, change: {}, input: {} };
export const onClick = (map) => Object.assign(handlers.click, map);
export const onSubmit = (map) => Object.assign(handlers.submit, map);
export const onChange = (map) => Object.assign(handlers.change, map);
export const onInput = (map) => Object.assign(handlers.input, map);

export function installEventDelegation() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    const fn = el && handlers.click[el.dataset.action];
    if (!fn) return;
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

// ---------- Diálogo modal ----------

const dialog = () => document.getElementById('dialog');
let returnFocus = null;

export function openDialog(html, { onClose } = {}) {
  const dlg = dialog();
  returnFocus = document.activeElement;
  dlg.innerHTML = html;
  dlg.onclose = () => {
    dlg.innerHTML = '';
    onClose?.();
    returnFocus?.focus?.();
  };
  if (!dlg.open) dlg.showModal();
  (dlg.querySelector('[autofocus]') ?? dlg.querySelector('input, select, button'))?.focus();
  return dlg;
}

export const closeDialog = () => dialog().open && dialog().close();

export function confirmDialog(message, { confirm = t('common.confirm'), danger = false, title = t('common.areYouSure') } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const dlg = openDialog(
      `<form method="dialog" class="sheet sheet-small">
        <h2>${h(title)}</h2>
        <p>${h(message)}</p>
        <div class="sheet-actions">
          <button value="no" class="btn btn-ghost">${h(t('common.cancel'))}</button>
          <button value="yes" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" autofocus>${h(confirm)}</button>
        </div>
      </form>`,
      // Cerrar con Esc o tocando fuera equivale a cancelar.
      { onClose: () => finish(false) },
    );
    // Se responde al tocar el botón, sin esperar a que el diálogo termine de cerrarse.
    dlg.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      finish(e.submitter?.value === 'yes');
      closeDialog();
    });
  });
}

onClick({ 'close-dialog': () => closeDialog() });

// ---------- Avisos (toasts) ----------

export function toast(message, { action, onAction, timeout = 4500, tone = 'info' } = {}) {
  const region = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.innerHTML = `<span>${h(message)}</span>${action ? `<button type="button" class="toast-action">${h(action)}</button>` : ''}`;
  const remove = () => el.remove();
  el.querySelector('.toast-action')?.addEventListener('click', () => {
    remove();
    onAction?.();
  });
  region.append(el);
  setTimeout(remove, timeout);
}

// ---------- Archivos ----------

export function download(filename, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Abre el selector de archivos y devuelve el texto del archivo elegido. */
export function pickTextFile(accept) {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.addEventListener('change', async () => resolve(input.files[0] ? await input.files[0].text() : null));
    input.click();
  });
}
