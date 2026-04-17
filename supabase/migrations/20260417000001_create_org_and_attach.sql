-- ================================================================
-- Migration: create_org_and_attach() RPC + org_type column
--
-- The onboarding form (app/onboarding/organization/OrganizationForm.tsx)
-- calls supabase.rpc("create_org_and_attach", { p_name, p_org_type }).
-- That function was never defined, and `organizations` was missing an
-- `org_type` column, so the call failed with PGRST202 / schema cache
-- miss. This migration:
--
-- 1. Adds organizations.org_type (restaurant | store | pharmacy |
--    warehouse) to match the TS OrgType enum in types/database.ts.
-- 2. Defines create_org_and_attach(p_name, p_org_type) as a
--    SECURITY DEFINER RPC that inserts the org, sets the caller's
--    profiles.org_id, and returns the new org's id.
-- ================================================================

BEGIN;

-- 1. org_type column
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_type TEXT;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_org_type_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_org_type_check
  CHECK (org_type IS NULL OR org_type IN ('restaurant', 'store', 'pharmacy', 'warehouse'));

-- 2. create_org_and_attach RPC
CREATE OR REPLACE FUNCTION public.create_org_and_attach(
  p_name     TEXT,
  p_org_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id  UUID;
  v_existing_org_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Organization name is required.';
  END IF;

  IF p_org_type IS NULL
     OR p_org_type NOT IN ('restaurant', 'store', 'pharmacy', 'warehouse') THEN
    RAISE EXCEPTION 'Invalid organization type: "%".', p_org_type;
  END IF;

  -- Refuse if the user already belongs to an org.
  SELECT org_id INTO v_existing_org_id
    FROM public.profiles
   WHERE id = v_user_id;

  IF v_existing_org_id IS NOT NULL THEN
    RAISE EXCEPTION 'User already belongs to an organization.';
  END IF;

  INSERT INTO public.organizations (name, org_type)
  VALUES (TRIM(p_name), p_org_type)
  RETURNING id INTO v_org_id;

  UPDATE public.profiles
     SET org_id = v_org_id
   WHERE id = v_user_id;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_org_and_attach(TEXT, TEXT) TO authenticated;

COMMIT;
