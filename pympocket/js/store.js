// Estado de la app: se carga una vez en memoria (rápido incluso con años de datos)
// y cada cambio se escribe en IndexedDB.
//
// Cada registro lleva id, createdAt, updatedAt y deletedAt. La sincronización
// (js/sync.js) se entera de cada cambio local mediante `setChangeHook` y aplica
// los cambios que llegan del servidor con `applyRemote`, resolviendo conflictos
// por "última modificación".
import * as db from './db.js';
import { builtinId, defaultCategories, nextColor } from './defaults.js';
import { uuid } from './util.js';

export const TRASH_DAYS = 30;
const BACKUPS_KEPT = 7;
const COLLECTIONS = ['movements', 'categories', 'budgets', 'recurring', 'goals', 'rates'];
/** Colecciones que se guardan en la cuenta del usuario. */
export const SYNCED = ['movements', 'categories', 'budgets', 'recurring', 'goals', 'settings'];
/** Ajustes propios de cada dispositivo: no se sincronizan. */
export const LOCAL_SETTINGS = new Set(['reminderDismissed', 'reminderNotified', 'lastBackup', 'categoryColorsFixed', 'demo']);
/** Fecha mínima: lo que se crea con esta fecha pierde contra cualquier versión del servidor. */
export const EPOCH = '1970-01-01T00:00:00.000Z';

export const DEFAULT_SETTINGS = {
  plan: 'free',
  refCurrency: null,
  lastCurrency: 'ARS',
  alertThreshold: 80,
  reminder: { enabled: false, frequency: 'daily', time: '21:00', weekday: 0 },
  reminderDismissed: null,
  reminderNotified: null,
  summary: 'weekly',
  summarySeen: null,
  lastBackup: null,
};

export const state = {
  movements: [],
  categories: [],
  budgets: [],
  recurring: [],
  goals: [],
  rates: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  /** Fecha de modificación de cada ajuste, para resolver conflictos. */
  settingsUpdatedAt: {},
};

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (what) => listeners.forEach((fn) => fn(what));

let changeHook = () => {};
/** La sincronización registra acá qué registros cambiaron localmente. */
export const setChangeHook = (fn) => (changeHook = fn);
const changed = (collection, ids) => {
  if (SYNCED.includes(collection)) changeHook(collection, [].concat(ids));
};

export async function load() {
  const results = await Promise.all(COLLECTIONS.map((name) => db.getAll(name)));
  COLLECTIONS.forEach((name, i) => (state[name] = results[i]));
  state.settings = structuredClone(DEFAULT_SETTINGS);
  state.settingsUpdatedAt = {};
  for (const { key, value, updatedAt } of await db.getAll('settings')) {
    state.settings[key] = value;
    state.settingsUpdatedAt[key] = updatedAt ?? EPOCH;
  }
}

/** Tareas de mantenimiento al abrir (después de sincronizar). */
export async function housekeeping() {
  await seedDefaults();
  await purgeOldTrash();
  await fixRepeatedColors();
}

/**
 * Crea las categorías predefinidas que falten. Tienen id fijo y fecha EPOCH:
 * si la cuenta ya las tiene (renombradas, por ejemplo) gana siempre la versión
 * del servidor, así que es seguro crearlas aunque todavía no se haya sincronizado.
 */
export async function seedDefaults() {
  const have = new Set(state.categories.map((c) => c.id));
  const missing = defaultCategories()
    .filter((c) => !have.has(c.id))
    .map((c) => ({ ...c, createdAt: EPOCH, updatedAt: EPOCH, deletedAt: null }));
  if (!missing.length) return;
  missing.forEach((c) => upsertInState('categories', c));
  await db.putMany('categories', missing);
  changed('categories', missing.map((c) => c.id));
  emit('categories');
}

/**
 * Una sola vez: da un color propio a las categorías personalizadas que
 * repiten el de otra (por ejemplo, las creadas al importar un CSV, que antes
 * quedaban todas en gris). Sus subcategorías toman el mismo color.
 */
async function fixRepeatedColors() {
  if (state.settings.categoryColorsFixed) return;
  const roots = state.categories.filter((c) => !c.deletedAt && !c.parentId);
  const recolored = [];
  for (const kind of ['expense', 'income']) {
    const used = new Set(roots.filter((c) => c.kind === kind && c.builtin).map((c) => c.color.toLowerCase()));
    const custom = roots.filter((c) => c.kind === kind && !c.builtin).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const c of custom) {
      const color = used.has(c.color.toLowerCase()) ? nextColor(used) : c.color;
      used.add(color.toLowerCase());
      if (color === c.color) continue;
      recolored.push({ ...c, color });
      for (const s of state.categories) if (s.parentId === c.id) recolored.push({ ...s, color });
    }
  }
  if (recolored.length) await saveMany('categories', recolored);
  await setSetting('categoryColorsFixed', true);
}

function stamp(obj) {
  const now = new Date().toISOString();
  return { ...obj, id: obj.id ?? uuid(), createdAt: obj.createdAt ?? now, updatedAt: now, deletedAt: obj.deletedAt ?? null };
}

function upsertInState(name, rec) {
  const list = state[name];
  const i = list.findIndex((r) => r.id === rec.id);
  if (i === -1) list.push(rec);
  else list[i] = rec;
}

export async function save(name, obj) {
  const rec = stamp(obj);
  upsertInState(name, rec);
  await db.put(name, rec);
  changed(name, rec.id);
  emit(name);
  return rec;
}

export async function saveMany(name, objs) {
  const recs = objs.map(stamp);
  recs.forEach((r) => upsertInState(name, r));
  await db.putMany(name, recs);
  changed(name, recs.map((r) => r.id));
  emit(name);
  return recs;
}

export const byId = (name, id) => state[name].find((r) => r.id === id);
/** Registros no eliminados. */
export const alive = (name) => state[name].filter((r) => !r.deletedAt);

export const softDelete = (name, id) => save(name, { ...byId(name, id), deletedAt: new Date().toISOString() });
export const restore = (name, id) => save(name, { ...byId(name, id), deletedAt: null });

/** Borra definitivamente (en la cuenta queda una marca para borrarlo en los otros dispositivos). */
export async function purge(name, ids) {
  const set = new Set([].concat(ids));
  state[name] = state[name].filter((r) => !set.has(r.id));
  await db.removeMany(name, [...set]);
  changed(name, [...set]);
  emit(name);
}

async function purgeOldTrash() {
  const limit = Date.now() - TRASH_DAYS * 86400000;
  const old = state.movements.filter((m) => m.deletedAt && Date.parse(m.deletedAt) < limit).map((m) => m.id);
  if (old.length) await purge('movements', old);
}

export async function setSetting(key, value) {
  const updatedAt = new Date().toISOString();
  state.settings[key] = value;
  state.settingsUpdatedAt[key] = updatedAt;
  await db.put('settings', { key, value, updatedAt });
  if (!LOCAL_SETTINGS.has(key)) changed('settings', key);
  emit('settings');
}

export async function saveRate(rate) {
  state.rates = state.rates.filter((r) => r.date !== rate.date).concat(rate);
  await db.put('rates', rate);
  emit('rates');
}

/** Registro local en el formato que se sube a la cuenta (null si se borró definitivamente). */
export function localRecord(collection, id) {
  if (collection === 'settings') {
    return id in state.settingsUpdatedAt ? { key: id, value: state.settings[id], updatedAt: state.settingsUpdatedAt[id] } : null;
  }
  return byId(collection, id) ?? null;
}

/**
 * Aplica cambios que llegan del servidor sin volver a marcarlos como
 * pendientes. `rows`: [{ collection, id, data, updated_at }]; data null = borrado.
 * Solo se aplica si la versión del servidor es más nueva que la local.
 */
export async function applyRemote(rows) {
  const touched = new Set();
  for (const row of rows) {
    const local = localRecord(row.collection, row.id);
    if (local && local.updatedAt >= row.updated_at) continue;
    if (row.collection === 'settings') {
      if (LOCAL_SETTINGS.has(row.id)) continue;
      if (row.data) {
        state.settings[row.id] = row.data.value;
        state.settingsUpdatedAt[row.id] = row.updated_at;
        await db.put('settings', { key: row.id, value: row.data.value, updatedAt: row.updated_at });
      }
    } else if (row.data) {
      const rec = { ...row.data, updatedAt: row.updated_at };
      upsertInState(row.collection, rec);
      await db.put(row.collection, rec);
    } else if (local) {
      state[row.collection] = state[row.collection].filter((r) => r.id !== row.id);
      await db.remove(row.collection, row.id);
    }
    touched.add(row.collection);
  }
  if (touched.size) emit('remote');
  return touched.size > 0;
}

// ---------- Datos anteriores al login ----------

/**
 * Pasa los datos que había en este navegador antes de existir las cuentas a la
 * base del usuario. Las categorías predefinidas reciben su id fijo para no
 * duplicarse con las de la cuenta.
 */
export async function importLegacy() {
  if (!(await db.exists(db.LEGACY_DB))) return 0;
  const legacy = await db.readAllFrom(db.LEGACY_DB);
  const movements = legacy.movements ?? [];
  if (!movements.length) return 0;

  const remap = new Map();
  for (const c of legacy.categories ?? []) if (c.builtin && c.key) remap.set(c.id, builtinId(c.key));
  const fix = (id) => (id && remap.has(id) ? remap.get(id) : id);
  const data = {
    categories: (legacy.categories ?? []).map((c) => ({ ...c, id: fix(c.id), parentId: fix(c.parentId) })),
    movements: movements.map((m) => ({ ...m, categoryId: fix(m.categoryId) })),
    budgets: (legacy.budgets ?? []).map((b) => ({ ...b, categoryId: fix(b.categoryId) })),
    recurring: (legacy.recurring ?? []).map((r) => ({ ...r, categoryId: fix(r.categoryId) })),
    goals: legacy.goals ?? [],
  };
  for (const [name, list] of Object.entries(data)) {
    // Si algo ya existe en la cuenta con fecha más nueva, se respeta.
    const fresh = list.filter((r) => !byId(name, r.id) || byId(name, r.id).updatedAt < r.updatedAt);
    fresh.forEach((r) => upsertInState(name, r));
    await db.putMany(name, fresh);
    changed(name, fresh.map((r) => r.id));
  }
  for (const { key, value } of legacy.settings ?? []) {
    if (!LOCAL_SETTINGS.has(key) && !(key in state.settingsUpdatedAt)) await setSetting(key, value);
  }
  await db.deleteDatabase(db.LEGACY_DB);
  emit('all');
  return movements.length;
}

// ---------- Respaldo, restauración y portabilidad ----------

export function exportAll() {
  const data = {};
  COLLECTIONS.forEach((name) => (data[name] = state[name]));
  data.settings = state.settings;
  return { app: 'PymPocket', format: 1, exportedAt: new Date().toISOString(), data };
}

export async function importAll(dump) {
  if (dump?.app !== 'PymPocket' || !dump.data) throw new Error('invalid-backup');
  const before = Object.fromEntries(SYNCED.filter((n) => n !== 'settings').map((n) => [n, state[n].map((r) => r.id)]));
  for (const name of COLLECTIONS) {
    await db.clear(name);
    await db.putMany(name, dump.data[name] ?? []);
  }
  await db.clear('settings');
  await load();
  for (const [key, value] of Object.entries(dump.data.settings ?? {})) await setSetting(key, value);
  // La cuenta queda igual que la copia: se suben sus registros y se borran los que no estaban.
  for (const [name, ids] of Object.entries(before)) {
    const now = new Set(state[name].map((r) => r.id));
    for (const r of state[name]) r.updatedAt = new Date().toISOString();
    await db.putMany(name, state[name]);
    changed(name, [...now, ...ids.filter((id) => !now.has(id))]);
  }
  emit('all');
}

/** Copia automática local (una por día, se guardan las últimas 7). */
export async function autoBackup() {
  const last = state.settings.lastBackup;
  if (last && Date.now() - Date.parse(last) < 86400000) return;
  const now = new Date().toISOString();
  await db.put('backups', { id: now, createdAt: now, dump: exportAll() });
  const all = (await db.getAll('backups')).sort((a, b) => b.id.localeCompare(a.id));
  const extra = all.slice(BACKUPS_KEPT).map((b) => b.id);
  if (extra.length) await db.removeMany('backups', extra);
  await setSetting('lastBackup', now);
}

export async function listBackups() {
  return (await db.getAll('backups')).sort((a, b) => b.id.localeCompare(a.id));
}

/** Borra los datos de este dispositivo (la cuenta se borra aparte, en sync.js). */
export async function wipeLocal() {
  for (const name of [...COLLECTIONS, 'settings', 'backups', 'meta']) await db.clear(name);
  await load();
  await housekeeping();
  emit('all');
}
