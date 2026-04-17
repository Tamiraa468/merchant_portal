export interface Summary {
  n: number;
  mean: number;
  stddev: number;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export function summarise(samples: number[]): Summary {
  if (samples.length === 0) {
    return { n: 0, mean: 0, stddev: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return {
    n,
    mean,
    stddev: Math.sqrt(variance),
    min: sorted[0]!,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[n - 1]!,
  };
}

// Linear interpolation between the two nearest ranks.  Matches the
// "type 7" estimator used by R quantile() / numpy default — the most
// common choice in performance literature.
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}
