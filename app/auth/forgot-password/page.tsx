import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot Password | Merchant Portal",
  description: "Reset your merchant account password",
};

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600 mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">
            Merchant Portal
          </h2>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Reset Password
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              Enter your email to receive reset instructions
            </p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
            <p className="text-yellow-700 dark:text-yellow-400 text-sm text-center">
              🚧 This feature is coming soon. Please contact support for
              password reset assistance.
            </p>
          </div>

          <Link
            href="/auth/login"
            className="block w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 
                     dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium 
                     rounded-lg transition-colors duration-200 text-center"
          >
            Back to Login
          </Link>
        </div>
      </div>
    </main>
  );
}
