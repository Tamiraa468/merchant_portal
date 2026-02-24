import { requireOrg } from "@/lib/auth/requireOrg";
import ProductsClient from "./ProductsClient";

export default async function ProductsPage() {
  // Ensure user is authenticated and has an organization
  // Redirects to /auth/login if not logged in
  // Redirects to /onboarding/organization if no org_id
  const { orgId } = await requireOrg();

  return <ProductsClient orgId={orgId} />;
}
