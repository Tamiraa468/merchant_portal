"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AuthFormData, AuthError } from "@/types/database";

interface AuthFormProps {
  mode: "login" | "register";
  /**
   * Registration type - determines which app identifier is sent.
   * The DB trigger reads raw_user_meta_data->>'app' and assigns role.
   * - "merchant" => app = "merchant_portal" => role = "org_user"
   * - "courier"  => app = "courier_app"      => role = "courier"
   */
  registerType?: "merchant" | "courier";
}

export default function AuthForm({
  mode,
  registerType = "merchant",
}: AuthFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [formData, setFormData] = useState<AuthFormData>({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    rememberMe: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form validation
  const validateForm = (): AuthError | null => {
    // Full name validation (register only)
    if (mode === "register" && !formData.fullName?.trim()) {
      return {
        message: "Please enter your full name",
        code: "INVALID_NAME",
      };
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email || !emailRegex.test(formData.email)) {
      return {
        message: "Please enter a valid email address",
        code: "INVALID_EMAIL",
      };
    }

    // Password validation
    if (!formData.password || formData.password.length < 8) {
      return {
        message: "Password must be at least 8 characters long",
        code: "WEAK_PASSWORD",
      };
    }

    // Confirm password validation (only for register)
    if (mode === "register" && formData.password !== formData.confirmPassword) {
      return { message: "Passwords do not match", code: "PASSWORD_MISMATCH" };
    }

    return null;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate form
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      if (mode === "register") {
        // Build metadata: send "app" identifier, NOT role.
        // The DB trigger reads raw_user_meta_data->>'app' to assign role.
        const appId =
          registerType === "courier" ? "courier_app" : "merchant_portal";
        const metadata: { full_name: string; app: string } = {
          full_name: formData.fullName?.trim() || "",
          app: appId,
        };

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: metadata,
            emailRedirectTo: `${window.location.origin}/auth/login`,
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        if (data.user) {
          // Check if email confirmation is required
          if (data.user.identities?.length === 0) {
            setError({
              message:
                "This email is already registered. Please try logging in.",
              code: "EMAIL_EXISTS",
            });
          } else if (!data.session) {
            // Email confirmation required
            setSuccess(
              "Registration successful! Please check your email to confirm your account.",
            );
          } else {
            // Auto-confirmed, redirect
            setCookiesAndRedirect();
          }
        }
      } else {
        // Login existing user
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: formData.email,
            password: formData.password,
          });

        if (signInError) {
          throw signInError;
        }

        if (data.session) {
          setCookiesAndRedirect();
        }
      }
    } catch (err: unknown) {
      const authError = err as {
        message?: string;
        code?: string;
        status?: number;
      };

      // Map common Supabase errors to user-friendly messages
      let errorMessage = authError.message || "An unexpected error occurred";

      if (authError.message?.includes("Invalid login credentials")) {
        errorMessage = "Invalid email or password. Please try again.";
      } else if (authError.message?.includes("Email not confirmed")) {
        errorMessage = "Please confirm your email address before logging in.";
      } else if (authError.message?.includes("User already registered")) {
        errorMessage =
          "This email is already registered. Please try logging in.";
      } else if (authError.status === 429) {
        errorMessage = "Too many attempts. Please wait a moment and try again.";
      } else if (authError.message?.includes("network")) {
        errorMessage =
          "Network error. Please check your connection and try again.";
      }

      setError({ message: errorMessage, code: authError.code });
    } finally {
      setLoading(false);
    }
  };

  // Set auth cookies and redirect
  const setCookiesAndRedirect = () => {
    // Supabase automatically handles cookies via the browser client
    // No need to manually set cookies

    // Get redirect URL or default to dashboard
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect") || "/dashboard";

    router.push(redirect);
    router.refresh();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    // Clear errors when user starts typing
    if (error) setError(null);
  };

  const isMerchant = registerType === "merchant";
  const title =
    mode === "login"
      ? "Welcome Back"
      : isMerchant
        ? "Create Merchant Account"
        : "Create Courier Account";
  const subtitle =
    mode === "login"
      ? "Sign in to your account"
      : isMerchant
        ? "Register as a new merchant"
        : "Register as a new courier";

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {title}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">{subtitle}</p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-green-700 dark:text-green-400 text-sm">
              {success}
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400 text-sm">
              {error.message}
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Full Name Field (Register only) */}
          {mode === "register" && (
            <div>
              <label
                htmlFor="fullName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Full Name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                value={formData.fullName}
                onChange={handleInputChange}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         transition-colors duration-200"
                placeholder="John Doe"
              />
            </div>
          )}

          {/* Email Field */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={formData.email}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       transition-colors duration-200"
              placeholder="you@example.com"
            />
          </div>

          {/* Password Field */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                value={formData.password}
                onChange={handleInputChange}
                className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 dark:border-gray-600 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         transition-colors duration-200"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 
                         dark:text-gray-400 dark:hover:text-gray-200"
              >
                {showPassword ? (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
            {mode === "register" && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Must be at least 8 characters
              </p>
            )}
          </div>

          {/* Confirm Password Field (Register only) */}
          {mode === "register" && (
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 dark:border-gray-600 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           transition-colors duration-200"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 
                           dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showConfirmPassword ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Remember Me & Forgot Password (Login only) */}
          {mode === "login" && (
            <div className="flex items-center justify-between">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleInputChange}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 
                           focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                />
                <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                  Remember me
                </span>
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 
                         dark:hover:text-blue-300 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                     text-white font-medium rounded-lg transition-colors duration-200
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                     flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
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
                {mode === "login" ? "Signing in..." : "Creating account..."}
              </>
            ) : mode === "login" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        {/* Switch Mode Link */}
        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <Link
                href="/auth/register"
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 
                         dark:hover:text-blue-300 font-medium transition-colors"
              >
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 
                         dark:hover:text-blue-300 font-medium transition-colors"
              >
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
