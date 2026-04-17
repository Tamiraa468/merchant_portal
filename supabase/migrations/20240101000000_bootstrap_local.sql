-- ================================================================
-- Bootstrap migration (local development only)
--
-- The dated migrations in this folder (starting 20250101000001) were
-- authored against a cloud Supabase project where `profiles` and
-- `products` had already been provisioned manually (see
-- `supabase/profiles-table.sql` and `supabase/products-table.sql`).
--
-- That leaves `supabase db reset` against a fresh local stack unable
-- to chain forward — migration 20250101000001 fails with
-- `relation "public.profiles" does not exist`.
--
-- This file creates the minimal baseline that the subsequent
-- migrations expect, so a clean `supabase db reset` on an empty
-- local DB succeeds end-to-end. It is idempotent (IF NOT EXISTS)
-- and runs before every dated migration.
-- ================================================================

BEGIN;

-- ── profile_role enum ──
-- Later migrations (e.g. 20260331000002) call
--   ALTER TYPE profile_role ADD VALUE IF NOT EXISTS 'merchant'
-- which fails if the type does not already exist.  The enum is
-- kept alongside profiles.role (TEXT + CHECK) because
-- subsequent migrations in this chain manipulate the CHECK
-- constraint rather than the enum.
DO $$ BEGIN
  CREATE TYPE public.profile_role AS ENUM (
    'org_user',
    'admin',
    'courier',
    'customer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── profiles ──
-- Baseline matches supabase/profiles-table.sql.  Later migrations:
--   20250101000001  adds org_id + updates CHECK values
--   20250317000001  replaces CHECK to allow 'customer' and installs
--                   the handle_new_user trigger
--   20260331000002  adds 'merchant' to profile_role enum
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'org_user'
              CHECK (role IN ('org_user', 'admin', 'courier')),
  full_name  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);
CREATE INDEX IF NOT EXISTS profiles_role_idx  ON public.profiles(role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- updated_at trigger (reused by later migrations)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ── products ──
-- Baseline matches supabase/products-table.sql.  task_items.product_id
-- (created in 20250101000002) references products(id), so the table
-- must exist before that migration runs.
--
-- org_id is intentionally nullable at this stage; migration
-- 20250101000001 creates the `organizations` table that future rows
-- will reference.  No FK is placed here to keep the baseline
-- order-independent.
CREATE TABLE IF NOT EXISTS public.products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID,
  name               TEXT NOT NULL,
  price              NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  unit               TEXT NOT NULL DEFAULT 'ш',
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  unavailable_until  TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_org_id_idx ON public.products(org_id);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Broad RLS policies — later migrations may override.
DROP POLICY IF EXISTS "products_select_own_org" ON public.products;
CREATE POLICY "products_select_own_org"
  ON public.products FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

COMMIT;
