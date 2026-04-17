import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const allowRemote = process.env.SEED_ALLOW_REMOTE === "true";

if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in .env");
if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");

function isLocalHost(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return h === "127.0.0.1" || h === "localhost" || h.endsWith(".local");
  } catch {
    return false;
  }
}

if (!isLocalHost(url) && !allowRemote) {
  console.error(
    `\n[ABORT] SUPABASE_URL="${url}" is not a local host.\n` +
      `Seed scripts refuse to run against a remote project by default.\n` +
      `Set SEED_ALLOW_REMOTE=true in .env only for an isolated scratch project.\n`,
  );
  process.exit(1);
}

export const SUPABASE_URL = url;
export const SERVICE_ROLE_KEY = serviceKey;

export const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "public" },
});

// ── Seed markers (used by reset.ts to delete seed-owned rows only) ──
export const SEED_EMAIL_DOMAIN = "seed.local";
export const SEED_ORG_PREFIX = "[SEED]";
export const SEED_PASSWORD = "SeedPass!2026";

export function isSeedEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith(`@${SEED_EMAIL_DOMAIN}`);
}

export function isSeedOrgName(name: string | null | undefined): boolean {
  return !!name && name.startsWith(SEED_ORG_PREFIX);
}
