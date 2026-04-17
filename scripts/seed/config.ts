// ────────────────────────────────────────────────────────────────
// Seed configuration — thesis benchmark dataset
// ────────────────────────────────────────────────────────────────
// Changing these numbers will invalidate prior benchmark results.
// Bump SEED_VERSION whenever distribution semantics change so past
// runs can be identified in CSV output.
export const SEED_VERSION = "2026-04-17.v1";

export const TARGETS = {
  organizations: 50,
  couriers: 200,
  orders: 1000,
  tasks: 500,
  productsPerOrg: { min: 8, max: 25 },
  locationsPerOrg: { min: 3, max: 10 },
  windowDays: 90,
} as const;

// Task status distribution — must sum to TARGETS.tasks.
// Mirrors the thesis spec: 200 completed, 100 published,
// 100 spread across in-flight stages, 100 draft.
export const TASK_STATUS_MIX: Record<string, number> = {
  completed: 200,
  published: 100,
  assigned: 33,
  picked_up: 33,
  delivered: 34,
  draft: 100,
};

// Organization type mix across the 50 orgs.
export const ORG_TYPE_MIX: Array<{ type: OrgType; count: number }> = [
  { type: "restaurant", count: 20 },
  { type: "store", count: 18 },
  { type: "pharmacy", count: 7 },
  { type: "warehouse", count: 5 },
];

export type OrgType = "restaurant" | "store" | "pharmacy" | "warehouse";

// Vehicle type distribution across the 200 couriers.
// (There is no vehicle_type column on profiles in the current merchant schema;
//  this metadata is stored in the auth user's raw_user_meta_data so that
//  courier-app consumers can read it downstream without a schema change.)
export const VEHICLE_TYPE_MIX: Array<{ type: string; weight: number }> = [
  { type: "bicycle", weight: 10 },
  { type: "motorbike", weight: 55 },
  { type: "car", weight: 30 },
  { type: "walking", weight: 5 },
];

// Order status distribution (must broadly match the state machine).
export const ORDER_STATUS_MIX: Record<string, number> = {
  paid: 400,
  ready_for_delivery: 300,
  preparing: 150,
  pending_payment: 100,
  cancelled: 50,
};

// Sanity-check totals on import — fails fast if someone edits above.
function assertSumEquals(
  name: string,
  obj: Record<string, number>,
  expected: number,
): void {
  const total = Object.values(obj).reduce((s, n) => s + n, 0);
  if (total !== expected) {
    throw new Error(
      `[config] ${name} sums to ${total}, expected ${expected}. Fix config.ts.`,
    );
  }
}

assertSumEquals("TASK_STATUS_MIX", TASK_STATUS_MIX, TARGETS.tasks);
assertSumEquals("ORDER_STATUS_MIX", ORDER_STATUS_MIX, TARGETS.orders);
assertSumEquals(
  "ORG_TYPE_MIX",
  Object.fromEntries(ORG_TYPE_MIX.map((o) => [o.type, o.count])),
  TARGETS.organizations,
);
