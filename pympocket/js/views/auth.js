// Pantallas de cuenta: ingresar, crear cuenta, recuperar contraseña,
// nueva contraseña y desbloqueo con huella/rostro.
import { t } from '../i18n.js';
import { h } from '../util.js';
import * as auth from '../auth.js';
import { biometricAvailable, enableBiometric, markUnlocked, unlockWithBiometric } from '../lock.js';
import { onClick, onSubmit, openDialog, closeDialog, toast } from '../ui.js';
import { icon } from './common.js';

const MIN_PASSWORD = 8;
let screen = 'login';
let message = null; // { tone: 'info' | 'error', text }
let lastEmail = '';
let done = () => {}; // qué hacer al terminar de ingresar (lo define app.js)

const root = () => document.getElementById('main');

/** Muestra las pantallas de cuenta. `onDone` se llama con la sesión iniciada. */
export function showAuth(initial = 'login', { onDone, notice = null } = {}) {
  done = onDone ?? done;
  screen = initial;
  message = notice;
  document.body.classList.add('auth-mode');
  draw();
}

export function hideAuth() {
  document.body.classList.remove('auth-mode');
}

function draw() {
  root().innerHTML = `<div class="auth">
    <div class="auth-card">
      <div class="auth-brand"><img src="icons/icon.svg" alt="" width="56" height="56"><span>Pym<strong>Pocket</strong></span></div>
      ${screens[screen]()}
    </div>
  </div>`;
  document.title = `${t(`auth.titles.${screen}`)} · PymPocket`;
  (root().querySelector('[autofocus]') ?? root().querySelector('h1'))?.focus();
}

const notice = () =>
  message ? `<p class="auth-msg auth-msg-${message.tone}" role="${message.tone === 'error' ? 'alert' : 'status'}">${h(message.text)}</p>` : '';

const passwordField = (name, label, autocomplete, { autofocus = false, hint = '' } = {}) => `
  <label>${h(label)}
    <span class="password-field">
      <input type="password" name="${name}" autocomplete="${autocomplete}" required minlength="${autocomplete === 'new-password' ? MIN_PASSWORD : 1}"
        ${autofocus ? 'autofocus' : ''} ${hint ? `aria-describedby="${name}-hint"` : ''}>
      <button type="button" class="btn-icon" data-action="toggle-password" aria-label="${h(t('auth.showPassword'))}" aria-pressed="false">${icon('eye')}</button>
    </span>
  </label>
  ${hint ? `<p class="muted small" id="${name}-hint">${h(hint)}</p>` : ''}`;

const screens = {
  login: () => `
    <h1 tabindex="-1">${h(t('auth.titles.login'))}</h1>
    ${notice()}
    <form data-form="auth-login" class="stack" novalidate>
      <label>${h(t('auth.email'))}<input type="email" name="email" autocomplete="username" required autofocus value="${h(lastEmail)}" inputmode="email"></label>
      ${passwordField('password', t('auth.password'), 'current-password')}
      <button class="btn btn-primary btn-large">${h(t('auth.signIn'))}</button>
    </form>
    <div class="auth-links">
      <button type="button" class="link-btn" data-action="auth-screen" data-screen="recover">${h(t('auth.forgot'))}</button>
      <p>${h(t('auth.noAccount'))} <button type="button" class="link-btn" data-action="auth-screen" data-screen="signup">${h(t('auth.createAccount'))}</button></p>
    </div>
    <div class="auth-demo">
      <a class="btn btn-ghost" href="?demo=1#/inicio">${icon('chart')} ${h(t('auth.tryDemo'))}</a>
    </div>`,

  signup: () => `
    <h1 tabindex="-1">${h(t('auth.titles.signup'))}</h1>
    ${notice()}
    <form data-form="auth-signup" class="stack" novalidate>
      <label>${h(t('auth.email'))}<input type="email" name="email" autocomplete="username" required autofocus value="${h(lastEmail)}" inputmode="email"></label>
      ${passwordField('password', t('auth.password'), 'new-password', { hint: t('auth.passwordHint', { n: MIN_PASSWORD }) })}
      ${passwordField('confirm', t('auth.confirmPassword'), 'new-password')}
      <label class="check"><input type="checkbox" name="consent" required> <span>${h(t('auth.consent'))}</span></label>
      <button class="btn btn-primary btn-large">${h(t('auth.createAccount'))}</button>
    </form>
    <div class="auth-links">
      <p>${h(t('auth.haveAccount'))} <button type="button" class="link-btn" data-action="auth-screen" data-screen="login">${h(t('auth.signIn'))}</button></p>
    </div>`,

  checkEmail: () => `
    <h1 tabindex="-1">${h(t('auth.titles.checkEmail'))}</h1>
    <p>${h(t('auth.checkEmailText', { email: lastEmail }))}</p>
    <p class="muted small">${h(t('auth.checkEmailHint'))}</p>
    <button type="button" class="btn btn-ghost" data-action="auth-screen" data-screen="login">${h(t('auth.backToLogin'))}</button>`,

  recover: () => `
    <h1 tabindex="-1">${h(t('auth.titles.recover'))}</h1>
    <p class="muted">${h(t('auth.recoverText'))}</p>
    ${notice()}
    <form data-form="auth-recover" class="stack" novalidate>
      <label>${h(t('auth.email'))}<input type="email" name="email" autocomplete="username" required autofocus value="${h(lastEmail)}" inputmode="email"></label>
      <button class="btn btn-primary btn-large">${h(t('auth.sendLink'))}</button>
    </form>
    <div class="auth-links"><button type="button" class="link-btn" data-action="auth-screen" data-screen="login">${h(t('auth.backToLogin'))}</button></div>`,

  newPassword: () => `
    <h1 tabindex="-1">${h(t('auth.titles.newPassword'))}</h1>
    ${notice()}
    <form data-form="auth-new-password" class="stack" novalidate>
      ${passwordField('password', t('auth.newPassword'), 'new-password', { autofocus: true, hint: t('auth.passwordHint', { n: MIN_PASSWORD }) })}
      ${passwordField('confirm', t('auth.confirmPassword'), 'new-password')}
      <button class="btn btn-primary btn-large">${h(t('auth.savePassword'))}</button>
    </form>`,

  notConfigured: () => `
    <h1 tabindex="-1">${h(t('auth.titles.notConfigured'))}</h1>
    <p>${h(t('auth.notConfiguredText'))}</p>
    <div class="auth-demo"><a class="btn btn-ghost" href="?demo=1#/inicio">${icon('chart')} ${h(t('auth.tryDemo'))}</a></div>`,
};

/** Traduce los errores de Supabase a mensajes simples. */
export function authErrorText(err) {
  const code = String(err?.code ?? '');
  const text = String(err?.message ?? '').toLowerCase();
  if (code === 'network' || err?.status === 0) return t('auth.errors.network');
  if (code === 'invalid_credentials' || code === 'invalid_grant' || text.includes('invalid login')) return t('auth.errors.credentials');
  if (code === 'email_not_confirmed' || text.includes('not confirmed')) return t('auth.errors.notConfirmed');
  if (code === 'user_already_exists' || text.includes('already registered')) return t('auth.errors.exists');
  if (code === 'weak_password' || text.includes('password should')) return t('auth.errors.weak', { n: MIN_PASSWORD });
  if (code === 'same_password') return t('auth.errors.samePassword');
  if (code === 'otp_expired' || code === 'access_denied') return t('auth.errors.linkExpired');
  if (err?.status === 429 || code.includes('rate_limit')) return t('auth.errors.rateLimit');
  return t('auth.errors.generic');
}

function fail(form, text) {
  const box = form.querySelector('.form-error') ?? form.insertAdjacentElement('beforeend', Object.assign(document.createElement('p'), { className: 'form-error' }));
  box.setAttribute('role', 'alert');
  box.textContent = text;
  form.querySelector('button.btn-primary')?.removeAttribute('disabled');
}

const busy = (form) => form.querySelector('button.btn-primary')?.setAttribute('disabled', '');
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

onClick({
  'auth-screen': (el) => {
    lastEmail = root().querySelector('input[name=email]')?.value.trim() || lastEmail;
    message = null;
    screen = el.dataset.screen;
    draw();
  },
  'toggle-password': (el) => {
    const input = el.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    el.setAttribute('aria-pressed', String(show));
    el.setAttribute('aria-label', t(show ? 'auth.hidePassword' : 'auth.showPassword'));
  },
});

onSubmit({
  'auth-login': async (data, form) => {
    const email = data.get('email').trim();
    const password = data.get('password');
    lastEmail = email;
    if (!validEmail(email)) return fail(form, t('auth.errors.email'));
    if (!password) return fail(form, t('auth.errors.passwordRequired'));
    busy(form);
    try {
      await auth.signIn(email, password);
      markUnlocked();
      done({ fresh: true });
    } catch (err) {
      fail(form, authErrorText(err));
    }
  },
  'auth-signup': async (data, form) => {
    const email = data.get('email').trim();
    const password = data.get('password');
    lastEmail = email;
    if (!validEmail(email)) return fail(form, t('auth.errors.email'));
    if (password.length < MIN_PASSWORD) return fail(form, t('auth.errors.weak', { n: MIN_PASSWORD }));
    if (password !== data.get('confirm')) return fail(form, t('auth.errors.mismatch'));
    if (!data.get('consent')) return fail(form, t('auth.errors.consent'));
    busy(form);
    try {
      const result = await auth.signUp(email, password);
      if (result.session) {
        markUnlocked();
        done({ fresh: true, isNew: true });
      } else {
        screen = 'checkEmail';
        draw();
      }
    } catch (err) {
      fail(form, authErrorText(err));
    }
  },
  'auth-recover': async (data, form) => {
    const email = data.get('email').trim();
    lastEmail = email;
    if (!validEmail(email)) return fail(form, t('auth.errors.email'));
    busy(form);
    try {
      await auth.recoverPassword(email);
      message = { tone: 'info', text: t('auth.recoverSent', { email }) };
      screen = 'login';
      draw();
    } catch (err) {
      fail(form, authErrorText(err));
    }
  },
  'auth-new-password': async (data, form) => {
    const password = data.get('password');
    if (password.length < MIN_PASSWORD) return fail(form, t('auth.errors.weak', { n: MIN_PASSWORD }));
    if (password !== data.get('confirm')) return fail(form, t('auth.errors.mismatch'));
    busy(form);
    try {
      await auth.updatePassword(password);
      markUnlocked();
      toast(t('auth.passwordUpdated'), { tone: 'success' });
      done({ fresh: true });
    } catch (err) {
      fail(form, authErrorText(err));
    }
  },
});

// ---------- Desbloqueo (pantalla superpuesta) ----------

let unlockResolve = null;

/** Muestra la pantalla de desbloqueo y resuelve cuando el usuario la pasa. */
export function showLock() {
  const el = document.getElementById('lock');
  const user = auth.currentUser();
  el.hidden = false;
  document.body.classList.add('locked');
  el.innerHTML = `<div class="auth-card lock-card" role="dialog" aria-modal="true" aria-labelledby="lock-title">
    <div class="auth-brand"><img src="icons/icon.svg" alt="" width="56" height="56"><span>Pym<strong>Pocket</strong></span></div>
    <h1 id="lock-title" tabindex="-1">${h(t('lock.title'))}</h1>
    <p class="muted">${h(user?.email ?? '')}</p>
    <button type="button" class="btn btn-primary btn-large" data-action="lock-biometric">${icon('fingerprint')} ${h(t('lock.unlock'))}</button>
    <p class="form-error" role="alert" id="lock-error"></p>
    <details class="lock-password">
      <summary>${h(t('lock.usePassword'))}</summary>
      <form data-form="lock-password" class="stack" novalidate>
        ${passwordField('password', t('auth.password'), 'current-password')}
        <button class="btn btn-ghost">${h(t('lock.unlockWithPassword'))}</button>
      </form>
    </details>
    <button type="button" class="link-btn" data-action="sign-out">${h(t('account.signOut'))}</button>
  </div>`;
  el.querySelector('h1').focus();
  return new Promise((resolve) => {
    unlockResolve = resolve;
    // En Android y escritorio se pide la huella enseguida; iOS exige un toque.
    if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) tryBiometric(true);
  });
}

function hideLock() {
  const el = document.getElementById('lock');
  el.hidden = true;
  el.innerHTML = '';
  document.body.classList.remove('locked');
  unlockResolve?.();
  unlockResolve = null;
}

async function tryBiometric(silent = false) {
  try {
    await unlockWithBiometric();
    hideLock();
  } catch (err) {
    if (!silent) document.getElementById('lock-error').textContent = t('lock.failed');
  }
}

onClick({ 'lock-biometric': () => tryBiometric() });

onSubmit({
  'lock-password': async (data, form) => {
    const password = data.get('password');
    if (!password) return fail(form, t('auth.errors.passwordRequired'));
    busy(form);
    try {
      await auth.reauthenticate(password);
      markUnlocked();
      hideLock();
    } catch (err) {
      fail(form, authErrorText(err));
    }
  },
});

// ---------- Ofrecer huella/rostro después de ingresar ----------

const OFFERED_KEY = 'pympocket.biometricOffered';

export async function offerBiometric() {
  const user = auth.currentUser();
  if (!user || !(await biometricAvailable())) return;
  let offered = [];
  try {
    offered = JSON.parse(localStorage.getItem(OFFERED_KEY)) ?? [];
  } catch {}
  if (offered.includes(user.id)) return;
  localStorage.setItem(OFFERED_KEY, JSON.stringify([...offered, user.id]));
  openDialog(`<div class="sheet sheet-small">
    <h2>${icon('fingerprint')} ${h(t('lock.offerTitle'))}</h2>
    <p>${h(t('lock.offerText'))}</p>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" data-action="close-dialog">${h(t('lock.notNow'))}</button>
      <button type="button" class="btn btn-primary" data-action="enable-biometric" autofocus>${h(t('lock.enable'))}</button>
    </div>
  </div>`);
}

onClick({
  'enable-biometric': async () => {
    try {
      await enableBiometric();
      closeDialog();
      toast(t('lock.enabled'), { tone: 'success' });
    } catch {
      toast(t('lock.enableFailed'), { tone: 'danger' });
    }
  },
});
