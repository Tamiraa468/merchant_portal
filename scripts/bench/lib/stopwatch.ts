import { hrtime } from "node:process";

// High-resolution timer backed by process.hrtime.bigint (nanoseconds).
// Use instead of Date.now() / performance.now() so we avoid the
// ~1 ms quantisation of millisecond clocks when measuring single RTTs.

export function start(): bigint {
  return hrtime.bigint();
}

export function elapsedMs(t0: bigint): number {
  return Number(hrtime.bigint() - t0) / 1_000_000;
}

export async function measure<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; ms: number }> {
  const t0 = start();
  const result = await fn();
  return { result, ms: elapsedMs(t0) };
}
