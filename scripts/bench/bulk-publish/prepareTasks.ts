import { admin } from "../../seed/lib/supabase";
import { randomUUID } from "node:crypto";

// Bulk-insert N draft delivery tasks for a given org and return their
// IDs.  Uses service_role (bypasses RLS) so it is not itself part of
// the benchmarked path — only the subsequent publish call is measured.
//
// Each task reuses two arbitrary locations that already belong to the
// org (seeded by `npm run seed:populate`).  A fresh random UUID is
// used per task so every iteration starts from a clean, unpublished
// set, even if earlier iterations left behind published rows.

interface OrgAssets {
  locationIds: string[];
}

const assetCache = new Map<string, OrgAssets>();

async function loadOrgAssets(orgId: string): Promise<OrgAssets> {
  const hit = assetCache.get(orgId);
  if (hit) return hit;

  const { data: locs, error: locErr } = await admin
    .from("locations")
    .select("id")
    .eq("org_id", orgId)
    .limit(50);
  if (locErr) throw new Error(`prepareTasks locations: ${locErr.message}`);
  if (!locs || locs.length < 2) {
    throw new Error(
      `prepareTasks: org ${orgId} has only ${locs?.length ?? 0} locations (need ≥ 2)`,
    );
  }

  const assets: OrgAssets = { locationIds: locs.map((l) => l.id as string) };
  assetCache.set(orgId, assets);
  return assets;
}

export async function prepareDraftTasks(
  orgId: string,
  n: number,
): Promise<string[]> {
  const assets = await loadOrgAssets(orgId);
  const ids: string[] = [];
  const rows = Array.from({ length: n }, () => {
    const id = randomUUID();
    ids.push(id);
    const pickup = assets.locationIds[0]!;
    const dropoff = assets.locationIds[1 % assets.locationIds.length]!;
    return {
      id,
      org_id: orgId,
      status: "draft",
      pickup_location_id: pickup,
      dropoff_location_id: dropoff,
      delivery_fee: 5000,
      customer_email: "bench@seed.local",
    };
  });

  // Supabase-js caps around ~1000 rows per insert; 500 is our max N so
  // a single call suffices, but chunk just in case.
  const CHUNK = 250;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await admin.from("delivery_tasks").insert(chunk);
    if (error) throw new Error(`prepareTasks insert: ${error.message}`);
  }

  return ids;
}

// After a benchmark iteration finishes, the published tasks are dead
// weight that accumulates if left alone.  Delete them via service_role
// (bypasses the merchant RLS policy and the transition trigger, which
// would block a direct UPDATE back to draft anyway).
export async function deleteTasks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // PostgREST's default max-uri-length is 8 KiB. Each UUID costs 37
  // bytes in the `?id=in.(…)` list, so 500 IDs overflows (~18 KiB).
  // 50 per call keeps the URL ≤ ~2 KiB with room for the rest of the
  // query string and headers.
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await admin
      .from("delivery_tasks")
      .delete()
      .in("id", chunk);
    if (error) throw new Error(`deleteTasks: ${error.message}`);
  }
}
