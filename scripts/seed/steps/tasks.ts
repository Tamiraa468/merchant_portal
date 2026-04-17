import { admin } from "../lib/supabase";
import { deterministicUuid, rngFor, pick, randInt } from "../lib/deterministic";
import { forEachWithProgress } from "../lib/progress";
import { TARGETS, TASK_STATUS_MIX } from "../config";
import type { SeededOrg } from "./organizations";
import type { SeededCourier } from "./users";
import type { LocationsAndProducts } from "./productsAndLocations";

const NOW = Date.now();
const DAY = 86_400_000;

export interface TaskSeedStats {
  inserted: number;
  byStatus: Record<string, number>;
  earningsInserted: number;
}

interface BuiltTask {
  id: string;
  org_id: string;
  status: string;
  pickup_location_id: string;
  dropoff_location_id: string;
  delivery_fee: number;
  courier_id: string | null;
  created_at: string;
  published_at: string | null;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  otp_verified: boolean;
}

// ─── Timestamp chain by status ──────────────────────────────────
// Returns ISO strings suitable for direct INSERT.  Durations are
// jittered but bounded so end-to-end ordering is always monotonic.
function buildTimestamps(
  status: string,
  rand: () => number,
  windowDays: number,
): Pick<
  BuiltTask,
  | "created_at"
  | "published_at"
  | "assigned_at"
  | "picked_up_at"
  | "delivered_at"
  | "completed_at"
> {
  const createdMs = NOW - Math.floor(rand() * windowDays * DAY);
  let t = createdMs;

  const publishedMs =
    status === "draft" ? null : (t += randInt(rand, 5 * 60_000, 2 * 3600_000));
  const assignedMs =
    ["draft", "published"].includes(status)
      ? null
      : (t += randInt(rand, 2 * 60_000, 6 * 3600_000));
  const pickedUpMs =
    ["draft", "published", "assigned"].includes(status)
      ? null
      : (t += randInt(rand, 10 * 60_000, 90 * 60_000));
  const deliveredMs =
    ["draft", "published", "assigned", "picked_up"].includes(status)
      ? null
      : (t += randInt(rand, 10 * 60_000, 60 * 60_000));
  const completedMs =
    status === "completed" ? (t += randInt(rand, 30_000, 30 * 60_000)) : null;

  const toIso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

  return {
    created_at: new Date(createdMs).toISOString(),
    published_at: toIso(publishedMs),
    assigned_at: toIso(assignedMs),
    picked_up_at: toIso(pickedUpMs),
    delivered_at: toIso(deliveredMs),
    completed_at: toIso(completedMs),
  };
}

function needsCourier(status: string): boolean {
  return ["assigned", "picked_up", "delivered", "completed"].includes(status);
}

export async function seedTasks(
  orgs: SeededOrg[],
  couriers: SeededCourier[],
  assets: LocationsAndProducts,
): Promise<TaskSeedStats> {
  const statuses: string[] = [];
  for (const [s, n] of Object.entries(TASK_STATUS_MIX)) {
    for (let i = 0; i < n; i++) statuses.push(s);
  }
  // Deterministic shuffle.
  const shuffleRand = rngFor("task-shuffle", "global");
  for (let i = statuses.length - 1; i > 0; i--) {
    const j = Math.floor(shuffleRand() * (i + 1));
    [statuses[i], statuses[j]] = [statuses[j]!, statuses[i]!];
  }

  // Build every row in memory first.  Skips any task for which the chosen
  // org does not have ≥2 locations (impossible with current config, but
  // keeps the code defensive if locationsPerOrg.min is ever set to 1).
  const tasks: BuiltTask[] = [];
  for (let i = 0; i < TARGETS.tasks; i++) {
    const rand = rngFor("task", i);
    const org = pick(rand, orgs);
    const locs = assets.locationsByOrg.get(org.id) ?? [];
    if (locs.length < 2) continue;

    const pickupLoc = pick(rand, locs);
    let dropoffLoc = pick(rand, locs);
    // Ensure distinct pickup/dropoff.
    let guard = 0;
    while (dropoffLoc.id === pickupLoc.id && guard++ < 5) {
      dropoffLoc = pick(rand, locs);
    }

    const status = statuses[i]!;
    const ts = buildTimestamps(status, rand, TARGETS.windowDays);
    const courierId = needsCourier(status) ? pick(rand, couriers).id : null;
    const deliveryFee = Math.round(randInt(rand, 2500, 12000) / 100) * 100;

    tasks.push({
      id: deterministicUuid("task", i),
      org_id: org.id,
      status,
      pickup_location_id: pickupLoc.id,
      dropoff_location_id: dropoffLoc.id,
      delivery_fee: deliveryFee,
      courier_id: courierId,
      otp_verified: status === "completed",
      ...ts,
    });
  }

  // ── Upsert tasks in chunks ──
  // Using upsert(onConflict='id') means that re-running on an existing seed
  // resets the random distribution for each row deterministically.
  await forEachWithProgress(
    "delivery_tasks",
    chunks(tasks, 150),
    async (chunk) => {
      const payload = chunk.map((t) => ({
        id: t.id,
        org_id: t.org_id,
        status: t.status,
        pickup_location_id: t.pickup_location_id,
        dropoff_location_id: t.dropoff_location_id,
        delivery_fee: t.delivery_fee,
        courier_id: t.courier_id,
        customer_email: "customer@seed.local",
        otp_verified: t.otp_verified,
        created_at: t.created_at,
        updated_at: t.completed_at ?? t.delivered_at ?? t.picked_up_at ?? t.assigned_at ?? t.published_at ?? t.created_at,
        published_at: t.published_at,
        assigned_at: t.assigned_at,
        picked_up_at: t.picked_up_at,
        delivered_at: t.delivered_at,
        completed_at: t.completed_at,
      }));
      const { error } = await admin
        .from("delivery_tasks")
        .upsert(payload, { onConflict: "id" });
      if (error) throw new Error(`delivery_tasks upsert: ${error.message}`);
    },
    2,
  );

  // ── Earnings for completed tasks ──
  const completed = tasks.filter((t) => t.status === "completed");
  await forEachWithProgress(
    "courier_earnings",
    chunks(completed, 200),
    async (chunk) => {
      const payload = chunk.map((t) => ({
        id: deterministicUuid("earning", t.id),
        courier_id: t.courier_id!,
        task_id: t.id,
        amount: t.delivery_fee,
        created_at: t.completed_at!,
      }));
      const { error } = await admin
        .from("courier_earnings")
        .upsert(payload, { onConflict: "task_id" });
      if (error) throw new Error(`courier_earnings upsert: ${error.message}`);
    },
    2,
  );

  const byStatus: Record<string, number> = {};
  for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;

  return {
    inserted: tasks.length,
    byStatus,
    earningsInserted: completed.length,
  };
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
