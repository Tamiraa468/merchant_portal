import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createSsrClient } from "@/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ALLOWED_ORG_TYPES = ["restaurant", "store", "pharmacy", "warehouse"] as const;
type OrgType = (typeof ALLOWED_ORG_TYPES)[number];

export async function POST(req: NextRequest) {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set." },
      { status: 500 },
    );
  }

  const ssr = await createSsrClient();
  const {
    data: { user },
    error: authError,
  } = await ssr.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const orgType = body?.orgType as string | undefined;

  if (!name) {
    return NextResponse.json({ error: "Organization name is required." }, { status: 400 });
  }

  if (!orgType || !ALLOWED_ORG_TYPES.includes(orgType as OrgType)) {
    return NextResponse.json({ error: "Invalid organization type." }, { status: 400 });
  }

  const admin = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error("[create-org] profile lookup failed:", profileError);
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  if (profile.org_id) {
    return NextResponse.json(
      { error: "User already belongs to an organization." },
      { status: 409 },
    );
  }

  const { data: org, error: insertError } = await admin
    .from("organizations")
    .insert({ name, org_type: orgType })
    .select("id")
    .single();

  if (insertError || !org) {
    console.error("[create-org] insert failed:", insertError);
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create organization." },
      { status: 500 },
    );
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ org_id: org.id })
    .eq("id", user.id);

  if (updateError) {
    console.error("[create-org] profile attach failed:", updateError);
    await admin.from("organizations").delete().eq("id", org.id);
    return NextResponse.json(
      { error: "Failed to attach organization to user." },
      { status: 500 },
    );
  }

  return NextResponse.json({ orgId: org.id });
}
