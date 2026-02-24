import { requireOnboarding } from "@/lib/auth/requireOrg";
import OrganizationForm from "./OrganizationForm";

export default async function OrganizationOnboardingPage() {
  // Ensure user is logged in but doesn't have an org yet
  await requireOnboarding();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Create Your Organization
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Set up your organization to start managing products and tasks.
            </p>
          </div>
          <OrganizationForm />
        </div>
      </div>
    </div>
  );
}
