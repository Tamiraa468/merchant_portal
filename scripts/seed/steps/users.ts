import {
  admin,
  SEED_EMAIL_DOMAIN,
  SEED_PASSWORD,
} from "../lib/supabase";
import { rngFor } from "../lib/deterministic";
import { forEachWithProgress } from "../lib/progress";
import { TARGETS, VEHICLE_TYPE_MIX } from "../config";
import { mongolianFullName, mongolianPhone } from "../data/names";
import type { SeededOrg } from "./organizations";

export interface SeededUser {
  id: string;
  email: string;
  full_name: string;
}

export interface SeededMerchant extends SeededUser {
  org_id: string;
}

export interface SeededCourier extends SeededUser {
  vehicle_type: string;
  phone: string;
}

// ── Helpers ─────────────────────────────────────────────────────

async function loadExistingSeedUsers(): Promise<Map<string, string>> {
  // Map: email → user id. Fetches the first page (1000 rows) which is the
  // hard limit; seed never creates more than ~260 users, so this is enough.
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const m = new Map<string, string>();
  for (const u of data.users) {
    if (u.email && u.email.endsWith(`@${SEED_EMAIL_DOMAIN}`)) {
      m.set(u.email, u.id);
    }
  }
  return m;
}

interface CreateInput {
  email: string;
  full_name: string;
  app: "merchant_portal" | "courier_app";
  extraMetadata?: Record<string, unknown>;
}

async function ensureAuthUser(
  existing: Map<string, string>,
  input: CreateInput,
): Promise<string> {
  const hit = existing.get(input.email);
  if (hit) {
    // Refresh metadata idempotently so vehicle_type / full_name updates land.
    const { error } = await admin.auth.admin.updateUserById(hit, {
      user_metadata: {
        app: input.app,
        full_name: input.full_name,
        ...input.extraMetadata,
      },
    });
    if (error) throw new Error(`updateUserById(${input.email}): ${error.message}`);
    return hit;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: {
      app: input.app,
      full_name: input.full_name,
      ...input.extraMetadata,
    },
  });
  if (error || !data.user) {
    throw new Error(`createUser(${input.email}): ${error?.message ?? "no user returned"}`);
  }
  existing.set(input.email, data.user.id);
  return data.user.id;
}

function weightedPickVehicle(rand: () => number): string {
  const total = VEHICLE_TYPE_MIX.reduce((s, v) => s + v.weight, 0);
  let r = rand() * total;
  for (const v of VEHICLE_TYPE_MIX) {
    r -= v.weight;
    if (r <= 0) return v.type;
  }
  return VEHICLE_TYPE_MIX[VEHICLE_TYPE_MIX.length - 1]!.type;
}

// ── Main entry ──────────────────────────────────────────────────

export async function seedUsers(
  orgs: SeededOrg[],
): Promise<{ merchants: SeededMerchant[]; couriers: SeededCourier[] }> {
  const existing = await loadExistingSeedUsers();

  // ── Merchants (1 per org, mapped to the owning organization) ──
  const merchantPlans = orgs.map((org, i) => {
    const rand = rngFor("merchant", i);
    return {
      email: `seed-merchant-${i.toString().padStart(3, "0")}@${SEED_EMAIL_DOMAIN}`,
      full_name: mongolianFullName(rand),
      org,
    };
  });

  const merchants: SeededMerchant[] = [];
  await forEachWithProgress(
    "merchants",
    merchantPlans,
    async (p) => {
      const id = await ensureAuthUser(existing, {
        email: p.email,
        full_name: p.full_name,
        app: "merchant_portal",
      });
      // Profile row was created by the handle_new_user trigger. Attach org_id.
      const { error: updErr } = await admin
        .from("profiles")
        .update({ org_id: p.org.id, full_name: p.full_name })
        .eq("id", id);
      if (updErr) throw new Error(`profile update(${p.email}): ${updErr.message}`);
      merchants.push({ id, email: p.email, full_name: p.full_name, org_id: p.org.id });
    },
    1, // auth admin API is serial-friendly; parallelising causes sporadic 500s on local stack
  );

  // ── Couriers (200, no org_id; vehicle_type in auth metadata) ──
  const courierPlans = Array.from({ length: TARGETS.couriers }, (_, i) => {
    const rand = rngFor("courier", i);
    return {
      email: `seed-courier-${i.toString().padStart(3, "0")}@${SEED_EMAIL_DOMAIN}`,
      full_name: mongolianFullName(rand),
      phone: mongolianPhone(rand),
      vehicle_type: weightedPickVehicle(rand),
    };
  });

  const couriers: SeededCourier[] = [];
  await forEachWithProgress(
    "couriers",
    courierPlans,
    async (p) => {
      const id = await ensureAuthUser(existing, {
        email: p.email,
        full_name: p.full_name,
        app: "courier_app",
        extraMetadata: {
          vehicle_type: p.vehicle_type,
          phone: p.phone,
          kyc_status: "approved", // informational only (no schema column)
        },
      });
      // Keep full_name in sync on the profile row.
      const { error: updErr } = await admin
        .from("profiles")
        .update({ full_name: p.full_name })
        .eq("id", id);
      if (updErr) throw new Error(`profile update(${p.email}): ${updErr.message}`);
      couriers.push({
        id,
        email: p.email,
        full_name: p.full_name,
        vehicle_type: p.vehicle_type,
        phone: p.phone,
      });
    },
    1,
  );

  return { merchants, couriers };
}
