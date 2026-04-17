import type { SupabaseClient } from "@supabase/supabase-js";

export interface StrategyResult {
  success: number;
  error: number;
}

export interface Strategy {
  name: string;
  description: string;
  run(client: SupabaseClient, ids: string[]): Promise<StrategyResult>;
}

// ─── 1. sequential_rpc ──────────────────────────────────────────────
// N serial RPC calls. Baseline worst-case for round-trip overhead.
const sequentialRpc: Strategy = {
  name: "sequential_rpc",
  description: "N serial publish_delivery_task() RPC calls",
  async run(client, ids) {
    let success = 0;
    let error = 0;
    for (const id of ids) {
      const { error: e } = await client.rpc("publish_delivery_task", {
        p_task_id: id,
      });
      if (e) error++;
      else success++;
    }
    return { success, error };
  },
};

// ─── 2. parallel_rpc ────────────────────────────────────────────────
// Same RPC but fired concurrently via Promise.all. Measures the
// combined effect of HTTP/2 multiplexing (PostgREST default), PgBouncer
// connection pooling, and server-side per-row trigger cost.
const parallelRpc: Strategy = {
  name: "parallel_rpc",
  description: "N concurrent publish_delivery_task() RPC calls",
  async run(client, ids) {
    const results = await Promise.all(
      ids.map((id) =>
        client.rpc("publish_delivery_task", { p_task_id: id }),
      ),
    );
    const success = results.filter((r) => !r.error).length;
    return { success, error: results.length - success };
  },
};

// ─── 3. batched_update ──────────────────────────────────────────────
// Single PostgREST UPDATE with `.in('id', ids)` — bypasses the publish
// RPC entirely and relies on the `merchant_update_tasks` RLS policy
// plus the status-transition trigger to validate each row.
const batchedUpdate: Strategy = {
  name: "batched_update",
  description: "Single .from('delivery_tasks').update().in('id', ids)",
  async run(client, ids) {
    const { data, error, count } = await client
      .from("delivery_tasks")
      .update(
        { status: "published", published_at: new Date().toISOString() },
        { count: "exact" },
      )
      .in("id", ids)
      .select("id");
    if (error) {
      if (process.env.BENCH_DEBUG) {
        console.error("[batched_update] error:", error);
      }
      return { success: 0, error: ids.length };
    }
    // Prefer the exact count header when provided; fall back to returned
    // row length.  Under some RLS return-filter edge cases `data` can be
    // an empty array even when the UPDATE affected rows.
    const success =
      count ?? (data as unknown[] | null)?.length ?? 0;
    return { success, error: ids.length - success };
  },
};

// ─── 4. bulk_rpc ────────────────────────────────────────────────────
// New Phase 2 RPC: publish_delivery_tasks_bulk(uuid[]). One HTTP round-
// trip, one UPDATE with id = ANY(), SECURITY DEFINER so the enforce_*
// trigger fires per row but RLS check is centralised to current_org_id.
const bulkRpc: Strategy = {
  name: "bulk_rpc",
  description: "Single publish_delivery_tasks_bulk(ids[]) RPC",
  async run(client, ids) {
    const { data, error } = await client.rpc("publish_delivery_tasks_bulk", {
      p_task_ids: ids,
    });
    if (error) return { success: 0, error: ids.length };
    const success = (data as unknown[] | null)?.length ?? 0;
    return { success, error: ids.length - success };
  },
};

export const STRATEGIES: readonly Strategy[] = [
  sequentialRpc,
  parallelRpc,
  batchedUpdate,
  bulkRpc,
];
