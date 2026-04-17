// ────────────────────────────────────────────────────────────────
// Thesis benchmark seed — populate the local Supabase DB with a
// reproducible, idempotent workload (organizations, merchants,
// couriers, products, locations, orders, delivery tasks, earnings).
//
// Usage:
//   npm run seed:populate
//
// The script is safe to re-run: all rows use deterministic UUIDs
// and upsert semantics, so repeated runs converge to the same
// canonical state without producing duplicates.
// ────────────────────────────────────────────────────────────────

import { SUPABASE_URL } from "./lib/supabase";
import { logSection, logSummary } from "./lib/progress";
import { SEED_VERSION, TARGETS } from "./config";
import { seedOrganizations } from "./steps/organizations";
import { seedUsers } from "./steps/users";
import { seedProductsAndLocations } from "./steps/productsAndLocations";
import { seedOrders } from "./steps/orders";
import { seedTasks } from "./steps/tasks";

export async function runSeed(): Promise<void> {
  const startedAt = Date.now();

  logSection(`Seed v${SEED_VERSION}`);
  logSummary([
    ["Supabase URL", SUPABASE_URL],
    ["Target orgs", TARGETS.organizations],
    ["Target couriers", TARGETS.couriers],
    ["Target orders", TARGETS.orders],
    ["Target tasks", TARGETS.tasks],
    ["Date window", `${TARGETS.windowDays} days`],
  ]);

  logSection("Step 1 / 5  organizations");
  const orgs = await seedOrganizations();

  logSection("Step 2 / 5  auth users");
  const { merchants, couriers } = await seedUsers(orgs);

  logSection("Step 3 / 5  products + locations");
  const assets = await seedProductsAndLocations(orgs);

  logSection("Step 4 / 5  orders");
  const orders = await seedOrders(orgs);

  logSection("Step 5 / 5  delivery tasks + earnings");
  const taskStats = await seedTasks(orgs, couriers, assets);

  const durationMs = Date.now() - startedAt;
  logSection("Summary");
  logSummary([
    ["Version", SEED_VERSION],
    ["Duration", `${(durationMs / 1000).toFixed(1)} s`],
    ["Organizations", orgs.length],
    ["Merchants", merchants.length],
    ["Couriers", couriers.length],
    ["Products", sumArrayMap(assets.productsByOrg)],
    ["Locations", sumArrayMap(assets.locationsByOrg)],
    ["Orders", orders.length],
    ["Delivery tasks", taskStats.inserted],
    ...Object.entries(taskStats.byStatus).map(
      ([k, v]) => [`  ├─ ${k}`, v] as [string, number],
    ),
    ["Courier earnings", taskStats.earningsInserted],
  ]);
  process.stdout.write(
    `Done. Default seed password: "SeedPass!2026" (see lib/supabase.ts).\n`,
  );
}

function sumArrayMap<K, V>(m: Map<K, V[]>): number {
  let total = 0;
  for (const v of m.values()) total += v.length;
  return total;
}

// Only auto-run when invoked as the entry script (tsx scripts/seed/seed.ts).
// When reset.ts imports runSeed() it will invoke it manually and await it.
const invokedAsScript =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /seed\.(ts|js|mjs|cjs)$/.test(process.argv[1]);

if (invokedAsScript) {
  runSeed().catch((err: unknown) => {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error(`\n[seed] FAILED\n${msg}`);
    process.exit(1);
  });
}
