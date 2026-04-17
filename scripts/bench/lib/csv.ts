import { writeFileSync } from "node:fs";

// Raw CSV always uses English column headers (ASCII-safe for LaTeX
// booktabs / pgfplots input and stable for git diffs).  Invoke with
// `--locale mn` to emit a parallel presentation CSV whose headers are
// Mongolian — used directly in the thesis table rendering pipeline.

export type Locale = "en" | "mn";

const TRANSLATIONS: Record<string, string> = {
  // Bulk-publish columns
  n: "Тоо",
  strategy: "Стратеги",
  iteration: "Давталт",
  total_ms: "Нийт_мс",
  per_task_ms: "Нэгж_мс",
  success_count: "Амжилт",
  error_count: "Алдаа",
  // RLS-overhead columns (reserved for Phase 3)
  query_type: "Query_төрөл",
  mode: "Горим",
  mean_ms: "Дундаж_мс",
  p50_ms: "P50_мс",
  p95_ms: "P95_мс",
  p99_ms: "P99_мс",
  stddev_ms: "Стандарт_хазайлт_мс",
  tps: "Нэгж_секунд",
  overhead_pct: "Зардал_хувь",
  // Meta columns
  seed_version: "Seed_хувилбар",
  git_sha: "Git_хэш",
  timestamp: "Цаг",
};

export function translateHeader(h: string, locale: Locale): string {
  if (locale === "en") return h;
  return TRANSLATIONS[h] ?? h;
}

function escapeField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? formatNumber(v) : String(v);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  // Preserve ≥3 significant figures for small numbers, else 2 decimals.
  if (Math.abs(n) >= 100) return n.toFixed(1);
  if (Math.abs(n) >= 10) return n.toFixed(2);
  return n.toFixed(3);
}

export function writeCsv<T extends Record<string, unknown>>(
  path: string,
  rows: T[],
  columns: (keyof T & string)[],
  locale: Locale = "en",
): void {
  const header = columns.map((c) => translateHeader(c, locale)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escapeField(r[c])).join(","))
    .join("\n");
  writeFileSync(path, `${header}\n${body}\n`, "utf8");
}
