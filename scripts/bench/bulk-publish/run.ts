// ────────────────────────────────────────────────────────────────
// Phase 2 — bulk publish throughput benchmark.
//
// Usage:
//   npm run bench:bulk-publish
//   npm run bench:bulk-publish -- --sizes 10,50,100 --iterations 10
//   npm run bench:bulk-publish -- --locale mn --out results/mn.csv
//
// For each (strategy × N) combination:
//   1. Insert N fresh draft tasks via service_role (setup, not timed).
//   2. Time the strategy's publish call with hrtime.bigint.
//   3. Delete the N tasks so the database does not grow.
//
// Warmup iterations are discarded; measurement iterations are written
// to a raw CSV plus a summary CSV with mean / p50 / p95 / p99 / stddev.
// ────────────────────────────────────────────────────────────────

import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { logSection, logSummary } from "../../seed/lib/progress";
import { signInAsSeedMerchant } from "../lib/auth";
import { start, elapsedMs } from "../lib/stopwatch";
import { summarise, type Summary } from "../lib/percentiles";
import { writeCsv, type Locale } from "../lib/csv";
import {
  BENCH_VERSION,
  BULK_PUBLISH_COLUMNS,
  BULK_PUBLISH_CONFIG,
  type BulkPublishSample,
} from "./config";
import { prepareDraftTasks, deleteTasks } from "./prepareTasks";
import { STRATEGIES, type Strategy } from "./strategies";

// ── CLI args ────────────────────────────────────────────────────
interface Args {
  sizes: number[];
  iterations: number;
  warmup: number;
  locale: Locale;
  outDir: string;
  merchantIndex: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    sizes: [...BULK_PUBLISH_CONFIG.sizes],
    iterations: BULK_PUBLISH_CONFIG.iterations,
    warmup: BULK_PUBLISH_CONFIG.warmup,
    locale: "en",
    outDir: resolve(process.cwd(), "bench-results/bulk-publish"),
    merchantIndex: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    switch (a) {
      case "--sizes":
        out.sizes = v!.split(",").map((x) => Number.parseInt(x, 10));
        i++;
        break;
      case "--iterations":
        out.iterations = Number.parseInt(v!, 10);
        i++;
        break;
      case "--warmup":
        out.warmup = Number.parseInt(v!, 10);
        i++;
        break;
      case "--locale":
        if (v !== "en" && v !== "mn") {
          throw new Error(`--locale must be 'en' or 'mn' (got '${v}')`);
        }
        out.locale = v;
        i++;
        break;
      case "--out":
        out.outDir = resolve(process.cwd(), v!);
        i++;
        break;
      case "--merchant":
        out.merchantIndex = Number.parseInt(v!, 10);
        i++;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }
  return out;
}

function printHelp(): void {
  process.stdout.write(
    `\nUsage: npm run bench:bulk-publish -- [flags]\n\n` +
      `Flags:\n` +
      `  --sizes 10,50,100,500   N sizes to benchmark (default: all four)\n` +
      `  --iterations 5          Measurement iterations per (strategy, N)\n` +
      `  --warmup 2              Warm-up iterations (discarded)\n` +
      `  --locale en|mn          Summary CSV header language\n` +
      `  --out <dir>             Output directory for CSVs\n` +
      `  --merchant N            Seed merchant index to auth as (default 0)\n\n`,
  );
}

// ── Main loop ───────────────────────────────────────────────────
async function runOne(
  strategy: Strategy,
  orgId: string,
  client: Awaited<ReturnType<typeof signInAsSeedMerchant>>["client"],
  n: number,
): Promise<{ totalMs: number; success: number; error: number; ids: string[] }> {
  const ids = await prepareDraftTasks(orgId, n);
  const t0 = start();
  const { success, error } = await strategy.run(client, ids);
  const totalMs = elapsedMs(t0);
  return { totalMs, success, error, ids };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  logSection(`bench:bulk-publish v${BENCH_VERSION}`);
  logSummary([
    ["Sizes", args.sizes.join(", ")],
    ["Iterations", args.iterations],
    ["Warmup", args.warmup],
    ["Locale", args.locale],
    ["Output dir", args.outDir],
    ["Merchant", `seed-merchant-${args.merchantIndex.toString().padStart(3, "0")}`],
  ]);

  const auth = await signInAsSeedMerchant(args.merchantIndex);
  process.stdout.write(
    `Signed in as ${auth.email}\n  user_id = ${auth.userId}\n  org_id  = ${auth.orgId}\n`,
  );

  const samples: BulkPublishSample[] = [];
  for (const strategy of STRATEGIES) {
    logSection(`strategy: ${strategy.name}`);
    process.stdout.write(`  ${strategy.description}\n`);
    for (const n of args.sizes) {
      // Warm-up — discarded.
      for (let i = 0; i < args.warmup; i++) {
        const { ids } = await runOne(strategy, auth.orgId, auth.client, n);
        await deleteTasks(ids);
      }
      // Measurement.
      const sizeTimings: number[] = [];
      for (let i = 0; i < args.iterations; i++) {
        const { totalMs, success, error, ids } = await runOne(
          strategy,
          auth.orgId,
          auth.client,
          n,
        );
        samples.push({
          strategy: strategy.name,
          n,
          iteration: i,
          total_ms: totalMs,
          per_task_ms: totalMs / n,
          success_count: success,
          error_count: error,
        });
        sizeTimings.push(totalMs);
        await deleteTasks(ids);
      }
      const s = summarise(sizeTimings);
      process.stdout.write(
        `  N=${n.toString().padStart(3)}  ` +
          `mean ${s.mean.toFixed(1).padStart(7)} ms  ` +
          `p50 ${s.p50.toFixed(1).padStart(7)} ms  ` +
          `p95 ${s.p95.toFixed(1).padStart(7)} ms  ` +
          `p99 ${s.p99.toFixed(1).padStart(7)} ms  ` +
          `(${args.iterations} samples)\n`,
      );
    }
  }

  // ── Output ─────────────────────────────────────────────────────
  mkdirSync(args.outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const rawPath = `${args.outDir}/raw-${ts}.csv`;
  writeCsv(rawPath, samples, [...BULK_PUBLISH_COLUMNS], "en");

  const summaryRows = buildSummary(samples);
  const summaryPath = `${args.outDir}/summary-${ts}.csv`;
  writeCsv(
    summaryPath,
    summaryRows,
    [
      "strategy",
      "n",
      "iteration", // repurposed below as "samples" count
      "mean_ms",
      "p50_ms",
      "p95_ms",
      "p99_ms",
      "stddev_ms",
      "total_ms",
      "per_task_ms",
      "success_count",
      "error_count",
    ] as const as unknown as (keyof (typeof summaryRows)[number] & string)[],
    args.locale,
  );

  logSection("Done");
  logSummary([
    ["Raw CSV", rawPath],
    ["Summary CSV", summaryPath],
    ["Samples captured", samples.length],
  ]);
  printConsoleTable(samples);
}

// One row per (strategy, N) with aggregated statistics.  total_ms and
// per_task_ms columns hold mean values for convenience; detail lives
// in the raw CSV.
interface SummaryRow {
  strategy: string;
  n: number;
  iteration: number;
  mean_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  stddev_ms: number;
  total_ms: number;
  per_task_ms: number;
  success_count: number;
  error_count: number;
}

function buildSummary(samples: BulkPublishSample[]): SummaryRow[] {
  const groups = new Map<string, BulkPublishSample[]>();
  for (const s of samples) {
    const k = `${s.strategy}|${s.n}`;
    const arr = groups.get(k) ?? [];
    arr.push(s);
    groups.set(k, arr);
  }
  const rows: SummaryRow[] = [];
  for (const [, arr] of groups) {
    const s0 = arr[0]!;
    const totals = arr.map((s) => s.total_ms);
    const stat: Summary = summarise(totals);
    const success = arr.reduce((a, s) => a + s.success_count, 0);
    const errors = arr.reduce((a, s) => a + s.error_count, 0);
    rows.push({
      strategy: s0.strategy,
      n: s0.n,
      iteration: arr.length, // "samples count"
      mean_ms: stat.mean,
      p50_ms: stat.p50,
      p95_ms: stat.p95,
      p99_ms: stat.p99,
      stddev_ms: stat.stddev,
      total_ms: stat.mean,
      per_task_ms: stat.mean / s0.n,
      success_count: success,
      error_count: errors,
    });
  }
  // Sort by strategy then N numerically (string sort would put 10<100<500<50).
  rows.sort((a, b) =>
    a.strategy === b.strategy ? a.n - b.n : a.strategy.localeCompare(b.strategy),
  );
  return rows;
}

function printConsoleTable(samples: BulkPublishSample[]): void {
  const rows = buildSummary(samples);
  const headers: Array<keyof SummaryRow> = [
    "strategy",
    "n",
    "mean_ms",
    "p50_ms",
    "p95_ms",
    "p99_ms",
    "per_task_ms",
    "error_count",
  ];
  const widths = headers.map((h) =>
    Math.max(
      h.length,
      ...rows.map((r) => String(r[h]).length),
    ),
  );
  const pad = (v: unknown, w: number) => String(v).padStart(w);
  const fmt = (v: unknown) =>
    typeof v === "number" ? v.toFixed(2) : String(v);

  process.stdout.write("\n");
  process.stdout.write(
    headers.map((h, i) => pad(h, widths[i]!)).join("  ") + "\n",
  );
  process.stdout.write(widths.map((w) => "─".repeat(w)).join("  ") + "\n");
  for (const r of rows) {
    process.stdout.write(
      headers.map((h, i) => pad(fmt(r[h]), widths[i]!)).join("  ") + "\n",
    );
  }
  process.stdout.write("\n");
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(`\n[bench:bulk-publish] FAILED\n${msg}`);
  process.exit(1);
});
