-- ================================================================
-- Migration: products INSERT/UPDATE/DELETE RLS policies
--
-- The bootstrap migration (20240101000000) GRANTed write privileges
-- on public.products to authenticated, but the only RLS policy
-- defined was FOR SELECT. With RLS enabled, any INSERT/UPDATE/DELETE
-- without a matching policy returns 403 — which is what the browser
-- sees when the ProductsClient form tries to add a product.
--
-- Scope writes to rows belonging to the caller's organisation using
-- the existing public.current_org_id() helper (SECURITY DEFINER, so
-- it reads profiles without recursing into products' own RLS).
-- ================================================================

BEGIN;

DROP POLICY IF EXISTS "products_insert_own_org" ON public.products;
CREATE POLICY "products_insert_own_org"
  ON public.products FOR INSERT
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "products_update_own_org" ON public.products;
CREATE POLICY "products_update_own_org"
  ON public.products FOR UPDATE
  USING     (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "products_delete_own_org" ON public.products;
CREATE POLICY "products_delete_own_org"
  ON public.products FOR DELETE
  USING (org_id = public.current_org_id());

COMMIT;
