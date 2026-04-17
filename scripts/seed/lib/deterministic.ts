import { v5 as uuidv5 } from "uuid";

// Fixed namespace — UUIDs derived from (kind, index) are stable across runs.
// Do not change this value; that would break idempotency on re-seed.
const SEED_NAMESPACE = "7a4e3e5c-4e2c-4b4b-9e8a-4c2e3d5f6a7b";

export function deterministicUuid(kind: string, index: number | string): string {
  return uuidv5(`${kind}:${index}`, SEED_NAMESPACE);
}

// Deterministic mulberry32 PRNG — keyed by (kind, index) so every seeded row
// regenerates the same "random" values on re-run.
export function rngFor(kind: string, index: number | string): () => number {
  const str = `${kind}:${index}`;
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

export function randInt(rand: () => number, lo: number, hi: number): number {
  return Math.floor(lo + rand() * (hi - lo + 1));
}
