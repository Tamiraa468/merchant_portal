# Benchmark scripts

Utilities for thesis-grade empirical measurements against a local Supabase
stack. Phase 0 (environment) and Phase 1 (seed) live here today; subsequent
phases (`bench/bulk-publish`, `bench/rls`, `bench/dashboard`, `bench/recharts`)
will be added as siblings of `seed/`.

## Phase 0 / 1 — seed dataset

### Prerequisites

1. **Local Supabase stack.** Phase 3 (RLS benchmark) relies on a dedicated
   PostgreSQL connection string, so we do _not_ benchmark against a cloud
   project. Start the local stack:

   ```bash
   supabase start
   ```

2. **Install deps** (new devDependencies added in Phase 0):

   ```bash
   npm install
   ```

3. **Configure `.env`**. Copy `.env.example` and fill in:

   - `NEXT_PUBLIC_SUPABASE_URL` — for a local stack this is
     `http://127.0.0.1:54321`.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from `supabase status`.
   - `SUPABASE_SERVICE_ROLE_KEY` — from `supabase status`. **Never commit
     this key.** Seed scripts read it directly; it is never loaded by any
     Next.js client component.
   - `BENCH_DATABASE_URL` — used by Phase 3 only
     (`postgresql://postgres:postgres@127.0.0.1:54322/postgres` for the
     default `supabase start` profile).
   - `SEED_ALLOW_REMOTE` — leave as `false`. Setting it to `true` tells the
     scripts to run even when `SUPABASE_URL` is non-local. That flag exists
     only for isolated cloud scratch projects and is **not** the intended
     path for thesis measurements.

### Commands

| Command | Effect |
|---|---|
| `npm run seed:populate` | Upsert the canonical seed dataset (idempotent). |
| `npm run seed:reset` | Delete every row that the seed owns. Safe to run at any time. |
| `npm run seed:reset -- --repopulate` | Delete, then immediately re-populate. |

### What gets created

| Entity | Count | Notes |
|---|---:|---|
| Organizations | 50 | 20 restaurant, 18 store, 7 pharmacy, 5 warehouse. Names prefixed `[SEED] [Type] …`. |
| Merchant auth users | 50 | 1 per org, `seed-merchant-NNN@seed.local`, role `org_user`. |
| Courier auth users | 200 | `seed-courier-NNN@seed.local`, role `courier`, vehicle mix 10/55/30/5 (bike/motorbike/car/walk). |
| Locations | ~250–500 | 3–10 per org, UB district + lat/lng jitter. |
| Products | ~400–1000 | 8–25 per org, price in MNT. |
| Orders | 1 000 | Spread over 90 days, status mix 400/300/150/100/50 (paid/ready/prep/pending/cancelled). |
| Delivery tasks | 500 | 200 completed, 100 published, 100 draft, 100 mid-flight (assigned 33 / picked_up 33 / delivered 34). |
| Courier earnings | 200 | One row per completed task. |

Default seed password: `SeedPass!2026`.

### Idempotency model

Every non-auth row is keyed by a deterministic UUID derived from
`uuidv5('<kind>:<index>', SEED_NAMESPACE)`. Running `seed:populate` again
re-generates the same IDs, so upserts converge without producing duplicates.
Auth users are keyed by email (`seed-*@seed.local`); the admin API treats
"already registered" as a signal to update metadata in place, not create a
new user.

The seed marker convention is also what `seed:reset` uses to scope its
deletes:

- Delete `organizations` whose name begins with `[SEED]`. Foreign-key
  cascades clean up `delivery_tasks`, `orders`, `order_items`, `locations`,
  `products`, `courier_earnings` and `task_items`.
- Delete `auth.users` whose email ends with `@seed.local`. The FK cascade
  from `profiles.id` handles the profile row.

Non-seed rows — for example, a real merchant account you registered during
manual QA — are never touched.

### Safety guard

`scripts/seed/lib/supabase.ts` refuses to start if `NEXT_PUBLIC_SUPABASE_URL`
resolves to anything other than `127.0.0.1`, `localhost` or a `*.local`
hostname. The only override is `SEED_ALLOW_REMOTE=true` in `.env`, which must
be opted into explicitly (it is intentionally not a CLI flag — it has to
persist in the environment file, so nobody enables it by accident for one
invocation).

### Known deviations from the original spec

- **No `courier_kyc` table.** The merchant portal schema has no KYC table;
  KYC lives in the courier app's schema. Instead we tag couriers with
  `kyc_status: "approved"` inside their auth metadata. This is informational
  only — the merchant portal never reads it.
- **No `vehicle_type` column.** Same rationale: stored in auth metadata
  (`user_metadata.vehicle_type`) rather than a new column we would have to
  migrate.
- **Faker.js is not used.** Faker has no `mn` locale, and curated pools for
  Mongolian given names, father-initial letters, UB district addresses and
  realistic product catalogs give more authentic data for the thesis than a
  mismatched Latin-script locale would.

### Reproducibility

Thesis measurements require `SEED_VERSION` to be reported alongside every
benchmark CSV. The current version is printed at the top of `seed:populate`
output and is defined in [`scripts/seed/config.ts`](seed/config.ts). Bump the
version string whenever distribution semantics change (count, status mix,
date window); never silently alter them.

## Phase roadmap (future folders under `scripts/`)

- `bench/bulk-publish/` — Phase 2: add bulk-publish RPC, instrument client,
  export CSV per N-size.
- `bench/rls/` — Phase 3: pgbench custom scripts for RLS-bypass vs
  RLS-enforced comparison plus `EXPLAIN ANALYZE` dumps.
- `bench/dashboard/` — Phase 4: TanStack Query onSuccess timing + Playwright
  cold/warm cache harness.
- `bench/recharts/` — Phase 5: React Profiler + Chrome tracing for chart
  render latency over 1 k / 5 k / 10 k row datasets.
