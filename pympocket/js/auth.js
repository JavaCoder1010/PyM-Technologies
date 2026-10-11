// Cuentas de usuario con Supabase Auth (email y contraseña).
// Se usa la API HTTP directamente, sin librerías. La sesión queda guardada en
// el dispositivo: después del primer ingreso la app abre sin pedir contraseña
// (o con huella/rostro si el usuario lo activó, ver js/lock.js).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const STORAGE_KEY = 'pympocket.session';

let session = null; // { access_token, refresh_token, expires_at, user: { id, email } }
const listeners = new Set();
export const onAuthChange = (fn) => listeners.add(fn);

// Se acepta la dirección con o sin "/" final, e incluso la de la API REST (…/rest/v1/).
const BASE = SUPABASE_URL.trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');

/**
 * ¿Está conectada con Supabase? Si la dirección configurada es la de la propia
 * app (un error común al copiar), se trata como no configurada.
 */
export const isConfigured = () => {
  if (!BASE || !SUPABASE_ANON_KEY) return false;
  try {
    return new URL(BASE).origin !== location.origin;
  } catch {
    return false;
  }
};
export const currentUser = () => session?.user ?? null;

export class AuthError extends Error {
  constructor(data = {}, status = 0) {
    super(data.msg || data.error_description || data.message || data.error || `HTTP ${status}`);
    this.status = status;
    this.code = data.error_code || data.code || data.error || (status === 0 ? 'network' : 'unknown');
  }
}

/** Dirección a la que vuelven los links de los emails (la raíz de la app). */
const redirectUrl = () => `${location.origin}${location.pathname}`;

export async function api(path, { method = 'POST', body, token, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AuthError({}, 0);
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) throw new AuthError(data, res.status);
  return data;
}

function setSession(raw) {
  session = raw
    ? {
        access_token: raw.access_token,
        refresh_token: raw.refresh_token,
        expires_at: Number(raw.expires_at) || Math.floor(Date.now() / 1000) + Number(raw.expires_in || 3600),
        user: { id: raw.user.id, email: raw.user.email },
      }
    : null;
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
  listeners.forEach((fn) => fn(session));
}

/**
 * Lee la sesión guardada y procesa los links de los emails (confirmación de
 * cuenta y recuperación de contraseña), que llegan como #access_token=…&type=…
 * Devuelve { session, type, error }.
 */
export async function init() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hash.has('access_token') || hash.has('error')) {
    history.replaceState(null, '', `${location.pathname}#/inicio`);
    if (hash.has('error')) return { session: restore(), error: hash.get('error_code') || hash.get('error') };
    try {
      const token = hash.get('access_token');
      const user = await api('/auth/v1/user', { method: 'GET', token });
      setSession({ access_token: token, refresh_token: hash.get('refresh_token'), expires_at: hash.get('expires_at'), expires_in: hash.get('expires_in'), user });
      return { session, type: hash.get('type') };
    } catch (err) {
      return { session: restore(), error: err.code };
    }
  }
  return { session: restore() };
}

function restore() {
  try {
    session = JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    session = null;
  }
  return session;
}

export async function signIn(email, password) {
  setSession(await api('/auth/v1/token?grant_type=password', { body: { email, password } }));
  return session;
}

/** Crea la cuenta. Si el proyecto pide confirmar el email, devuelve { confirmationSent: true }. */
export async function signUp(email, password) {
  const data = await api(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectUrl())}`, { body: { email, password } });
  if (data.access_token) {
    setSession(data);
    return { session };
  }
  return { confirmationSent: true };
}

export const recoverPassword = (email) =>
  api(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectUrl())}`, { body: { email } });

export async function updatePassword(password) {
  await api('/auth/v1/user', { method: 'PUT', body: { password }, token: await accessToken() });
}

/** Vuelve a pedir la contraseña del usuario actual (por ejemplo, al desbloquear). */
export const reauthenticate = (password) => signIn(session.user.email, password);

export async function signOut() {
  const token = session?.access_token;
  setSession(null);
  if (token) api('/auth/v1/logout', { token }).catch(() => {});
}

let refreshing = null;
/** Token vigente; lo renueva si está por vencer. Sin conexión devuelve null. */
export async function accessToken() {
  if (!session) return null;
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  refreshing ??= api('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } })
    .then((data) => setSession(data))
    .catch((err) => {
      // Sesión vencida o revocada (por ejemplo, cambió la contraseña en otro dispositivo).
      if (err.status === 400 || err.status === 401) setSession(null);
      throw err;
    })
    .finally(() => (refreshing = null));
  await refreshing;
  return session?.access_token ?? null;
}

/** Borra la cuenta y todos sus datos del servidor (función delete_user, ver supabase/schema.sql). */
export async function deleteAccount() {
  await api('/rest/v1/rpc/delete_user', { body: {}, token: await accessToken() });
  setSession(null);
}
