-- ================================================================
-- Migration 20260403000003: Repair available_tasks
--
-- The ghost migration 20260403000001 re-introduced the legacy
-- sync_available_tasks trigger that tries to INSERT into
-- available_tasks with a pickup_address column that doesn't exist.
--
-- This migration:
--   1. Drops ALL sync_available_tasks triggers and functions
--   2. Drops available_tasks (table or view)
--   3. Re-creates available_tasks as a VIEW (matching 006)
--   4. Re-grants permissions
-- ================================================================

BEGIN;

-- 1. Kill ALL variants of the sync trigger
DROP TRIGGER IF EXISTS sync_available_tasks_trigger ON delivery_tasks;
DROP TRIGGER IF EXISTS trg_sync_available_tasks ON delivery_tasks;
DROP FUNCTION IF EXISTS public.sync_available_tasks() CASCADE;

-- 2. Drop available_tasks whether it's a table or view
DROP VIEW  IF EXISTS available_tasks CASCADE;
DROP TABLE IF EXISTS available_tasks CASCADE;

-- 3. Re-create as a VIEW (identical to migration 006)
CREATE VIEW available_tasks AS
SELECT
  dt.id              AS task_id,
  dt.org_id,
  dt.order_id,
  dt.pickup_location_id,
  dt.dropoff_location_id,
  dt.pickup_note,
  dt.dropoff_note,
  dt.note,
  dt.package_value,
  dt.delivery_fee,
  dt.suggested_fee,
  dt.receiver_name,
  dt.receiver_phone,
  dt.status,
  dt.created_at,
  dt.published_at
FROM delivery_tasks dt
WHERE dt.status = 'published'
  AND dt.courier_id IS NULL;

-- 4. Grants
GRANT SELECT ON available_tasks TO authenticated;
GRANT ALL    ON available_tasks TO service_role;

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
