// Acceso a IndexedDB: los datos viven en el dispositivo y la app funciona sin conexión.
// Cada usuario tiene su propia base (pympocket-<id>) y la demo usa una aparte,
// así nunca se mezclan datos de distintas cuentas en el mismo navegador.

export const LEGACY_DB = 'pympocket'; // base anterior al login
const VERSION = 3;

/** Almacenes y su clave primaria. */
export const STORES = {
  movements: 'id',
  categories: 'id',
  budgets: 'id',
  recurring: 'id',
  goals: 'id',
  settings: 'key',
  rates: 'date',
  backups: 'id',
  meta: 'key', // estado de la sincronización
  rateSeries: 'id', // historiales de cotizaciones (ver rates.js)
};

let dbName = null;
let dbPromise = null;

/** Elige la base a usar. Se llama una vez al arrancar, antes de cualquier lectura. */
export function useDatabase(name) {
  if (name === dbName) return;
  dbPromise?.then((db) => db.close());
  dbName = name;
  dbPromise = null;
}

export const currentDatabase = () => dbName;

function open(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [store, keyPath] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(store)) continue;
        const os = db.createObjectStore(store, { keyPath });
        if (store === 'movements') os.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDB() {
  if (!dbName) throw new Error('No se eligió la base de datos');
  dbPromise ??= open(dbName);
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getAll = (store) => run(store, 'readonly', (os) => os.getAll());
export const get = (store, key) => run(store, 'readonly', (os) => os.get(key));
export const put = (store, value) => run(store, 'readwrite', (os) => os.put(value));
export const putMany = (store, values) =>
  run(store, 'readwrite', (os) => {
    values.forEach((v) => os.put(v));
  });
export const remove = (store, key) => run(store, 'readwrite', (os) => os.delete(key));
export const removeMany = (store, keys) =>
  run(store, 'readwrite', (os) => {
    keys.forEach((k) => os.delete(k));
  });
export const clear = (store) => run(store, 'readwrite', (os) => os.clear());

/** ¿Existe una base con ese nombre? (sin crearla) */
export async function exists(name) {
  if (indexedDB.databases) return (await indexedDB.databases()).some((d) => d.name === name);
  return true; // navegadores viejos: se intenta leerla igual
}

/** Lee todos los almacenes de otra base (por ejemplo, la anterior al login). */
export async function readAllFrom(name) {
  const db = await open(name);
  const out = {};
  for (const store of Object.keys(STORES)) {
    if (!db.objectStoreNames.contains(store)) continue;
    out[store] = await new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  db.close();
  return out;
}

export function deleteDatabase(name) {
  if (name === dbName) useDatabase(null);
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
