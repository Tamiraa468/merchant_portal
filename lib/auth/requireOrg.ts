import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

export interface RequireOrgResult {
  userId: string;
  orgId: string;
  role: UserRole;
}

/**
 * Server-only helper to ensure user is authenticated and has an organization.
 * - If not logged in -> redirects to /auth/login
 * - If no org_id -> redirects to /onboarding/organization
 * - Otherwise returns { userId, orgId, role }
 */
export async function requireOrg(): Promise<RequireOrgResult> {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/auth/login");
  }

  // Fetch profile with org_id and role
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("Failed to fetch profile:", profileError);
    redirect("/auth/login");
  }

  // If no org_id, redirect to onboarding
  if (!profile.org_id) {
    redirect("/onboarding/organization");
  }

  return {
    userId: user.id,
    orgId: profile.org_id,
    role: profile.role as UserRole,
  };
}

/**
 * Check if user needs onboarding (has no org_id).
 * Returns null if user should proceed to onboarding page.
 * Redirects to /auth/login if not authenticated.
 * Redirects to /products if already has org.
 */
export async function requireOnboarding(): Promise<{ userId: string }> {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/auth/login");
  }

  // Fetch profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error("Failed to fetch profile:", profileError);
    redirect("/auth/login");
  }

  // If user already has org, redirect to products
  if (profile?.org_id) {
    redirect("/products");
  }

  return { userId: user.id };
}
