"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MERCHANT_ALLOWED_ROLES, type UserRole } from "@/types/database";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import AppLayout from "@/components/layout/AppLayout";

interface MerchantLayoutProps {
  children: React.ReactNode;
}

export default function MerchantLayout({ children }: MerchantLayoutProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleUnauthorizedAccess = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }, [router, supabase.auth]);

  const checkAuthorization = useCallback(async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/auth/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        console.error("Failed to fetch profile:", profileError);
        await handleUnauthorizedAccess();
        return;
      }

      const userRole = profile.role as UserRole;
      if (!MERCHANT_ALLOWED_ROLES.includes(userRole)) {
        console.warn(`Unauthorized role "${userRole}" attempted access`);
        await handleUnauthorizedAccess();
        return;
      }

      setIsAuthorized(true);
    } catch (error) {
      console.error("Authorization check failed:", error);
      await handleUnauthorizedAccess();
    } finally {
      setIsLoading(false);
    }
  }, [router, handleUnauthorizedAccess, supabase]);

  useEffect(() => {
    checkAuthorization();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/auth/login");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        checkAuthorization();
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [checkAuthorization, router, supabase.auth]);

  // Render the chrome immediately so sidebar/topbar/page skeletons appear
  // during the auth check. If the user turns out to be unauthorized, the
  // checkAuthorization flow signs them out and redirects.
  if (!isLoading && !isAuthorized) {
    return null;
  }

  return (
    <ErrorBoundary>
      <AppLayout>{children}</AppLayout>
    </ErrorBoundary>
  );
}
