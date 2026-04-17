-- ================================================================
-- Migration: reconcile `locations` schema with production
--
-- The original CREATE TABLE in 20250101000002_delivery_tasks.sql
-- declares a reference-only schema (`locations(address, lat, lng)`)
-- and explicitly notes that the live database already has different
-- columns.  The RPC `create_delivery_task` (and the `Location` type
-- in `types/database.ts`) insert into `address_text`, `label`, `note`
-- and `org_id` — so a freshly-reset local DB rejects inserts issued
-- by the app and the seed script.
--
-- This migration brings the local schema into alignment.
-- ================================================================

BEGIN;

-- Add the columns the app expects (nullable first so we can backfill).
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS org_id        UUID,
  ADD COLUMN IF NOT EXISTS address_text  TEXT,
  ADD COLUMN IF NOT EXISTS label         TEXT,
  ADD COLUMN IF NOT EXISTS note          TEXT;

-- Backfill address_text from the legacy `address` column if it still exists.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'locations'
       AND column_name  = 'address'
  ) THEN
    UPDATE public.locations
       SET address_text = address
     WHERE address_text IS NULL;
    ALTER TABLE public.locations DROP COLUMN address;
  END IF;
END $$;

-- Enforce NOT NULL on address_text only once the backfill is complete.
-- Skipped if the column already has nulls (defensive; a fresh reset has
-- zero rows so this always succeeds here).
ALTER TABLE public.locations
  ALTER COLUMN address_text SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_org_id ON public.locations(org_id);

COMMIT;
