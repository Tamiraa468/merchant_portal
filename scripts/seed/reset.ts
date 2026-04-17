// ────────────────────────────────────────────────────────────────
// Thesis benchmark seed — wipe seed-owned rows.
//
// Usage:
//   npm run seed:reset              # delete only
//   npm run seed:reset -- --repopulate  # delete, then seed:populate
//
// Only rows written by this seed script are touched:
//   • organizations whose name begins with "[SEED]"
//     → cascades to delivery_tasks, orders, locations, courier_earnings,
//       task_items (via ON DELETE CASCADE FKs)
//   • auth.users whose email ends with "@seed.local"
//     → cascades to profiles (profiles.id REFERENCES auth.users ON DELETE CASCADE)
// ────────────────────────────────────────────────────────────────

import {
  admin,
  SEED_EMAIL_DOMAIN,
  SEED_ORG_PREFIX,
  SUPABASE_URL,
} from "./lib/supabase";
import { forEachWithProgress, logSection, logSummary } from "./lib/progress";

async function deleteSeedUsers(): Promise<number> {
  // auth.admin.listUsers paginates; fetch all, filter, delete.
  const targets: string[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) {
      if (u.email && u.email.endsWith(`@${SEED_EMAIL_DOMAIN}`)) {
        targets.push(u.id);
      }
    }
    if (data.users.length < 1000) break;
    page++;
  }

  await forEachWithProgress(
    "auth.users",
    targets,
    async (id) => {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(`deleteUser(${id}): ${error.message}`);
    },
    4,
  );
  return targets.length;
}

async function deleteSeedOrganizations(): Promise<number> {
  // supabase-js .delete() requires a filter; `.like()` targets only seed rows.
  // Count first (so the log shows progress size), then delete.
  const { count: orgCount, error: countErr } = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .like("name", `${SEED_ORG_PREFIX}%`);
  if (countErr) throw new Error(`count organizations: ${countErr.message}`);

  const { error } = await admin
    .from("organizations")
    .delete()
    .like("name", `${SEED_ORG_PREFIX}%`);
  if (error) throw new Error(`delete organizations: ${error.message}`);
  return orgCount ?? 0;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  logSection("Seed reset");
  logSummary([
    ["Supabase URL", SUPABASE_URL],
    ["Org marker", `${SEED_ORG_PREFIX}%`],
    ["Email marker", `*@${SEED_EMAIL_DOMAIN}`],
  ]);

  logSection("Step 1 / 2  delete organizations (cascades to tasks/orders)");
  const orgsDeleted = await deleteSeedOrganizations();

  logSection("Step 2 / 2  delete auth users (cascades to profiles)");
  const usersDeleted = await deleteSeedUsers();

  logSection("Summary");
  logSummary([
    ["Duration", `${((Date.now() - startedAt) / 1000).toFixed(1)} s`],
    ["Organizations deleted", orgsDeleted],
    ["Auth users deleted", usersDeleted],
  ]);

  if (process.argv.includes("--repopulate")) {
    logSection("Re-populating");
    const { runSeed } = await import("./seed");
    await runSeed();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(`\n[seed:reset] FAILED\n${msg}`);
  process.exit(1);
});
