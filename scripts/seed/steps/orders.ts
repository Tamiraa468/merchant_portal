import { admin } from "../lib/supabase";
import { deterministicUuid, rngFor, pick, randInt } from "../lib/deterministic";
import { forEachWithProgress } from "../lib/progress";
import { TARGETS, ORDER_STATUS_MIX } from "../config";
import { mongolianFullName, mongolianPhone } from "../data/names";
import type { SeededOrg } from "./organizations";

export interface SeededOrder {
  id: string;
  org_id: string;
  status: string;
  delivery_fee: number;
  total_amount: number;
  created_at: string;
}

// Build a pre-shuffled array of statuses whose length = TARGETS.orders.
function buildStatusPlan(): string[] {
  const plan: string[] = [];
  for (const [status, n] of Object.entries(ORDER_STATUS_MIX)) {
    for (let i = 0; i < n; i++) plan.push(status);
  }
  // Deterministic shuffle — keyed by fixed salt so re-runs produce the same
  // assignment. Fisher-Yates with rngFor-backed randomness.
  const rand = rngFor("order-shuffle", "global");
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [plan[i], plan[j]] = [plan[j]!, plan[i]!];
  }
  return plan;
}

function createdAtFor(rand: () => number, windowDays: number): string {
  const now = Date.now();
  const offsetMs = Math.floor(rand() * windowDays * 24 * 3600 * 1000);
  return new Date(now - offsetMs).toISOString();
}

export async function seedOrders(orgs: SeededOrg[]): Promise<SeededOrder[]> {
  const statuses = buildStatusPlan();
  const rows: SeededOrder[] = [];

  for (let i = 0; i < TARGETS.orders; i++) {
    const rand = rngFor("order", i);
    const org = pick(rand, orgs);
    const status = statuses[i]!;

    // Order-line size is implicit: we skip order_items (the dashboard /
    // financials queries only aggregate orders.total_amount) and seed
    // subtotal + total_amount directly.  This keeps the recalc trigger
    // from firing per-row, cutting insert time by ~4×.
    const itemCount = randInt(rand, 1, 5);
    let subtotal = 0;
    for (let k = 0; k < itemCount; k++) {
      subtotal += randInt(rand, 3000, 25000);
    }
    subtotal = Math.round(subtotal / 100) * 100;
    const deliveryFee = Math.round(randInt(rand, 2500, 9000) / 100) * 100;
    const total = subtotal + deliveryFee;

    rows.push({
      id: deterministicUuid("order", i),
      org_id: org.id,
      status,
      delivery_fee: deliveryFee,
      total_amount: total,
      created_at: createdAtFor(rand, TARGETS.windowDays),
    });
  }

  // Upsert in chunks.
  await forEachWithProgress(
    "orders",
    chunks(rows, 200),
    async (chunk) => {
      const rand = rngFor("order-customers", chunk[0]!.id);
      const payload = chunk.map((o) => ({
        id: o.id,
        org_id: o.org_id,
        customer_id: null, // avoid generating 1000 customer auth users
        customer_name: mongolianFullName(rand),
        customer_phone: mongolianPhone(rand),
        status: o.status,
        currency: "MNT",
        subtotal: o.total_amount - o.delivery_fee,
        delivery_fee: o.delivery_fee,
        total_amount: o.total_amount,
        created_at: o.created_at,
        updated_at: o.created_at,
      }));
      const { error } = await admin
        .from("orders")
        .upsert(payload, { onConflict: "id" });
      if (error) throw new Error(`orders upsert: ${error.message}`);
    },
    2,
  );

  return rows;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
