// Persistence. Classrooms are saved in this browser's localStorage, one key per
// classroom plus a small index for the list. Every function is async so this
// module can be swapped for a server API without changing the rest of the app.
import { migrate } from './model.js';

// The single-file offline build (scripts/build-offline.mjs defines CLASSSHUFFLE_OFFLINE)
// keeps its data apart from the web version; backups move classrooms between them.
/* global CLASSSHUFFLE_OFFLINE */
const OFFLINE = typeof CLASSSHUFFLE_OFFLINE !== 'undefined' && CLASSSHUFFLE_OFFLINE === true;
const PREFIX = OFFLINE ? 'classshuffle-offline.' : 'classshuffle.';
const INDEX_KEY = `${PREFIX}classrooms`;
const LAST_KEY = `${PREFIX}last`;
const docKey = (id) => `${PREFIX}classroom.${id}`;

/** @typedef {{ id: string, name: string, updatedAt: string, students: number, demo?: boolean }} ClassroomSummary */

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

/** @returns {Promise<ClassroomSummary[]>} most recently changed first */
export async function listClassrooms() {
  const index = read(INDEX_KEY, []);
  return index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadClassroom(id) {
  const doc = read(docKey(id), null);
  return doc ? migrate(doc) : null;
}

/** Throws if storage is full or unavailable (the caller shows the error). */
export async function saveClassroom(doc) {
  write(docKey(doc.id), doc);
  const index = read(INDEX_KEY, []).filter((c) => c.id !== doc.id);
  index.push({ id: doc.id, name: doc.name, updatedAt: doc.updatedAt, students: doc.students.length, demo: Boolean(doc.demo) });
  write(INDEX_KEY, index);
}

export async function deleteClassroom(id) {
  localStorage.removeItem(docKey(id));
  write(INDEX_KEY, read(INDEX_KEY, []).filter((c) => c.id !== id));
  if (lastOpened() === id) localStorage.removeItem(LAST_KEY);
}

export const lastOpened = () => read(LAST_KEY, null);
export function rememberOpened(id) {
  try {
    write(LAST_KEY, id);
  } catch {}
}
