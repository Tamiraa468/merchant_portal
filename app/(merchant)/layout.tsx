"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MERCHANT_ALLOWED_ROLES, type UserRole } from "@/types/database";

interface MerchantLayoutProps {
  children: React.ReactNode;
}

export default function MerchantLayout({ children }: MerchantLayoutProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleUnauthorizedAccess = useCallback(async () => {
    // Sign out the user
    await supabase.auth.signOut();

    // Redirect to login
    router.replace("/auth/login");
  }, [router, supabase.auth]);

  const checkAuthorization = useCallback(async () => {
    try {
      // Get current authenticated user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      // No user or error - redirect to login
      if (userError || !user) {
        router.replace("/auth/login");
        return;
      }

      // Fetch user's role from profiles table
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      // Profile fetch error or no profile - sign out and redirect
      if (profileError || !profile) {
        console.error("Failed to fetch profile:", profileError);
        await handleUnauthorizedAccess();
        return;
      }

      const userRole = profile.role as UserRole;

      // Check if user role is allowed
      if (!MERCHANT_ALLOWED_ROLES.includes(userRole)) {
        console.warn(
          `Unauthorized role "${userRole}" attempted to access merchant area`,
        );
        await handleUnauthorizedAccess();
        return;
      }

      // User is authorized
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

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/auth/login");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        // Re-check authorization on auth state change
        checkAuthorization();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkAuthorization, router, supabase.auth]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <svg
            className="animate-spin h-10 w-10 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-gray-600 dark:text-gray-400">
            Verifying access...
          </p>
        </div>
      </div>
    );
  }

  // Not authorized - will redirect, show nothing
  if (!isAuthorized) {
    return null;
  }

  // Authorized - render children
  return <>{children}</>;
}
