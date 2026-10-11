// Sincronización entre dispositivos (web y celular) a través de Supabase.
//
// La app funciona siempre con los datos locales (IndexedDB). Cada cambio local
// queda pendiente y se sube cuando hay conexión; los cambios de otros
// dispositivos se bajan con un cursor (server_updated_at). Si el mismo
// registro cambió en dos lugares, gana la modificación más reciente, tanto
// acá (store.applyRemote) como en el servidor (trigger en supabase/schema.sql).
import * as db from './db.js';
import { SYNCED, applyRemote, localRecord, setChangeHook } from './store.js';
import { accessToken, api, currentUser } from './auth.js';
import { debounce } from './util.js';

const TABLE = '/rest/v1/records';
const PAGE = 1000;
const BATCH = 400;

let pending = new Set(); // "colección|id"
let cursor = null;
let running = null;
let again = false;
let enabled = false;

const status = { state: 'idle', lastSync: null, error: null };
const listeners = new Set();
export const onSyncStatus = (fn) => (listeners.add(fn), fn(status));
export const syncStatus = () => ({ ...status, pending: pending.size });
const setStatus = (patch) => {
  Object.assign(status, patch);
  listeners.forEach((fn) => fn(status));
};

const savePending = debounce(() => db.put('meta', { key: 'pending', value: [...pending] }).catch(() => {}), 300);
const scheduleSync = debounce(() => syncNow(), 1500);

/** Activa la sincronización para el usuario actual (después de abrir su base). */
export async function startSync() {
  pending = new Set((await db.get('meta', 'pending'))?.value ?? []);
  cursor = (await db.get('meta', 'cursor'))?.value ?? null;
  status.lastSync = (await db.get('meta', 'lastSync'))?.value ?? null;
  enabled = true;
  setChangeHook((collection, ids) => {
    ids.forEach((id) => pending.add(`${collection}|${id}`));
    savePending();
    scheduleSync();
  });
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow());
  setInterval(() => document.visibilityState === 'visible' && syncNow(), 60000);
}

/** Sube lo pendiente y baja lo nuevo. Se puede llamar en cualquier momento. */
export function syncNow() {
  if (!enabled) return Promise.resolve(false);
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    // Se cede el turno primero: si no, al salir enseguida (sin conexión) el
    // `finally` correría antes de que `running` quede asignado y nunca se liberaría.
    await null;
    let changedLocally = false;
    try {
      do {
        again = false;
        if (!navigator.onLine) {
          setStatus({ state: 'offline' });
          return false;
        }
        setStatus({ state: 'syncing', error: null });
        await push();
        changedLocally = (await pull()) || changedLocally;
      } while (again);
      status.lastSync = new Date().toISOString();
      await db.put('meta', { key: 'lastSync', value: status.lastSync });
      setStatus({ state: pending.size ? 'pending' : 'synced' });
    } catch (err) {
      console.warn('Sincronización', err);
      setStatus({ state: err.status === 0 || err.code === 'network' ? 'offline' : 'error', error: err.message });
    } finally {
      running = null;
    }
    return changedLocally;
  })();
  return running;
}

async function headers() {
  const token = await accessToken();
  if (!token) throw Object.assign(new Error('Sin sesión'), { code: 'no-session' });
  return token;
}

async function push() {
  if (!pending.size) return;
  const userId = currentUser().id;
  const keys = [...pending];
  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH);
    const snapshot = new Map();
    const rows = chunk.map((key) => {
      const [collection, id] = key.split('|');
      const rec = localRecord(collection, id);
      // Sin registro local = se borró definitivamente: se sube una marca de borrado.
      const updatedAt = rec?.updatedAt ?? new Date().toISOString();
      snapshot.set(key, updatedAt);
      return { user_id: userId, collection, id, data: rec, updated_at: updatedAt, deleted: !rec || Boolean(rec.deletedAt) };
    });
    await api(`${TABLE}?on_conflict=user_id,collection,id`, {
      body: rows,
      token: await headers(),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    // Se quitan de pendientes salvo que hayan vuelto a cambiar mientras se subían.
    for (const key of chunk) {
      const [collection, id] = key.split('|');
      const now = localRecord(collection, id)?.updatedAt;
      if (!now || now === snapshot.get(key)) pending.delete(key);
    }
    savePending();
  }
}

async function pull() {
  let changed = false;
  for (;;) {
    const filter = cursor ? `&server_updated_at=gt.${encodeURIComponent(cursor)}` : '';
    const rows = await api(
      `${TABLE}?select=collection,id,data,updated_at,server_updated_at${filter}&order=server_updated_at.asc&limit=${PAGE}`,
      { method: 'GET', token: await headers() },
    );
    if (!rows.length) break;
    const relevant = rows
      .filter((r) => SYNCED.includes(r.collection) && !pending.has(`${r.collection}|${r.id}`))
      .map((r) => ({ ...r, updated_at: new Date(r.updated_at).toISOString() }));
    changed = (await applyRemote(relevant)) || changed;
    cursor = rows.at(-1).server_updated_at;
    await db.put('meta', { key: 'cursor', value: cursor });
    if (rows.length < PAGE) break;
  }
  return changed;
}

/** Antes de cerrar sesión: intenta subir lo pendiente. Devuelve cuántos cambios quedaron sin subir. */
export async function flush() {
  if (pending.size && navigator.onLine) await syncNow().catch(() => {});
  return pending.size;
}

/** Borra todos los datos de la cuenta en el servidor (se mantiene la cuenta). */
export async function deleteRemoteData() {
  await api(`${TABLE}?user_id=eq.${currentUser().id}`, { method: 'DELETE', token: await headers() });
  pending.clear();
  cursor = null;
}

