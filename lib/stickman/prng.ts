/**
 * Deterministická náhoda pro panáčka a rozvržení davu. Čisté funkce, bez Math.random.
 */

/** mulberry32: rychlý 32bit PRNG. Stejný seed = stejná posloupnost na serveru i v prohlížeči. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Promíchání celého čísla na 32bit hash (pro jitter podle indexu). */
export function hash32(n: number): number {
  let h = (n >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Hodnota v rozsahu [min, max). */
export const range = (rnd: () => number, min: number, max: number) => min + (max - min) * rnd();

/** Vážený výběr: weights se nemusí sčítat na 1. */
export function pick<T>(rnd: () => number, items: readonly T[], weights?: readonly number[]): T {
  if (!weights) return items[Math.floor(rnd() * items.length) % items.length]!;
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}
