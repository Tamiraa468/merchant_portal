/**
 * Courier Registration Component
 *
 * This component is designed for the Courier App registration flow.
 * It sends app = "courier_app" in metadata so the DB trigger
 * assigns role = "courier" on the server side.
 *
 * Usage in Courier App:
 * import CourierRegister from '@/components/auth/CourierRegister';
 * <CourierRegister />
 */

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface FormData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FormError {
  message: string;
  code?: string;
}

export default function CourierRegister() {
  const router = useRouter();
  const supabase = createClient();
  const [formData, setFormData] = useState<FormData>({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validateForm = (): FormError | null => {
    if (!formData.fullName.trim()) {
      return { message: "Please enter your full name", code: "INVALID_NAME" };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email || !emailRegex.test(formData.email)) {
      return {
        message: "Please enter a valid email address",
        code: "INVALID_EMAIL",
      };
    }

    if (!formData.password || formData.password.length < 8) {
      return {
        message: "Password must be at least 8 characters long",
        code: "WEAK_PASSWORD",
      };
    }

    if (formData.password !== formData.confirmPassword) {
      return { message: "Passwords do not match", code: "PASSWORD_MISMATCH" };
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      // COURIER REGISTRATION:
      // Send app = "courier_app" so the DB trigger assigns role = "courier".
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName.trim(),
            app: "courier_app",
          },
          emailRedirectTo: `${window.location.origin}/auth/login`,
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (data.user) {
        if (data.user.identities?.length === 0) {
          setError({
            message: "This email is already registered. Please try logging in.",
            code: "EMAIL_EXISTS",
          });
        } else if (!data.session) {
          setSuccess(
            "Registration successful! Please check your email to confirm your account.",
          );
        } else {
          // Auto-confirmed - redirect to courier dashboard
          router.push("/courier/dashboard");
          router.refresh();
        }
      }
    } catch (err: unknown) {
      const authError = err as {
        message?: string;
        code?: string;
        status?: number;
      };
      let errorMessage = authError.message || "An unexpected error occurred";

      if (authError.message?.includes("User already registered")) {
        errorMessage =
          "This email is already registered. Please try logging in.";
      } else if (authError.status === 429) {
        errorMessage = "Too many attempts. Please wait a moment and try again.";
      }

      setError({ message: errorMessage, code: authError.code });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Create Courier Account
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Register as a delivery courier
          </p>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-green-700 dark:text-green-400 text-sm">
              {success}
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400 text-sm">
              {error.message}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
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
              required
              value={formData.fullName}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="John Doe"
            />
          </div>

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
              required
              value={formData.email}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

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
                required
                value={formData.password}
                onChange={handleInputChange}
                className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 dark:border-gray-600 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Must be at least 8 characters
            </p>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              value={formData.confirmPassword}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-400
                     text-white font-medium rounded-lg transition-colors
                     flex items-center justify-center"
          >
            {loading ? "Creating account..." : "Create Courier Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
