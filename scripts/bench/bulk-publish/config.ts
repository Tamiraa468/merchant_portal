export const BENCH_VERSION = "2026-04-17.v1";

export const BULK_PUBLISH_CONFIG = {
  // N ∈ {10, 50, 100, 500} as specified in the thesis plan.
  // Large values dominate the runtime — keep smaller than DB row budget.
  sizes: [10, 50, 100, 500] as const,
  // Warm-up iterations are executed before measurement to (a) let the
  // supabase-js client open HTTP connections, (b) populate PostgREST's
  // prepared-statement cache, and (c) bring the PL/pgSQL trigger plan
  // cache to steady state. Results from warm-up are discarded.
  warmup: 2,
  // Measurement iterations per (strategy, size). 5 is the minimum that
  // produces non-trivial p95/p99 estimates; raise for the final thesis
  // dataset once the harness is validated.
  iterations: 5,
} as const;

// Keys used on sample rows / CSV columns.  Kept here so Phase 2b UI
// harness can reuse the exact schema.
export const BULK_PUBLISH_COLUMNS = [
  "strategy",
  "n",
  "iteration",
  "total_ms",
  "per_task_ms",
  "success_count",
  "error_count",
] as const;

export type BulkPublishColumn = (typeof BULK_PUBLISH_COLUMNS)[number];

export interface BulkPublishSample {
  strategy: string;
  n: number;
  iteration: number;
  total_ms: number;
  per_task_ms: number;
  success_count: number;
  error_count: number;
}
