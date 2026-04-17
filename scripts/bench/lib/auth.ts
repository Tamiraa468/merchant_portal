import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SEED_PASSWORD } from "../../seed/lib/supabase";

// The anon (publishable) key lives in NEXT_PUBLIC_SUPABASE_ANON_KEY — the
// same value the browser client uses — so benchmarks exercise the real
// RLS-enforced path a merchant user would hit.
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!ANON_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in .env");
}

export interface AuthenticatedClient {
  client: SupabaseClient;
  userId: string;
  email: string;
  orgId: string;
}

export async function signInAsSeedMerchant(
  index: number = 0,
): Promise<AuthenticatedClient> {
  const email = `seed-merchant-${index.toString().padStart(3, "0")}@seed.local`;

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: SEED_PASSWORD,
  });
  if (error || !data.user) {
    throw new Error(
      `signInAsSeedMerchant(${email}): ${error?.message ?? "no user"}`,
    );
  }

  // Fetch org_id for this merchant (needed so the bench can insert draft
  // tasks that belong to the right org before publishing them).
  const { data: profile, error: profileErr } = await client
    .from("profiles")
    .select("org_id")
    .eq("id", data.user.id)
    .single();
  if (profileErr || !profile?.org_id) {
    throw new Error(
      `Could not read org_id for ${email}: ${profileErr?.message ?? "null"}`,
    );
  }

  return {
    client,
    userId: data.user.id,
    email,
    orgId: profile.org_id as string,
  };
}
