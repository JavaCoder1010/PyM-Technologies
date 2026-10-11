// @ts-check
// Seeded random numbers. The same seed always gives the same sequence, so a
// seating plan can be reproduced (and tests are repeatable).

/** A fresh random 32-bit seed. */
export function randomSeed() {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 2 ** 32);
}

/**
 * Small, fast generator (mulberry32). Not for security; good enough for shuffling.
 * @param {number} seed
 */
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Number in [0, 1). */
    next,
    /** @template T @param {T[]} list @returns {T} */
    pick: (list) => list[Math.floor(next() * list.length)],
    /** Copy of `list` in random order (Fisher–Yates). @template T @param {T[]} list @returns {T[]} */
    shuffle(list) {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
