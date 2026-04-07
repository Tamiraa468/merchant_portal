-- ================================================================
-- Migration 007: Drop legacy sync_available_tasks trigger/function
--
-- The sync_available_tasks() function was created by the original
-- migration 003 to sync delivery_tasks rows into the available_tasks
-- table. It fires on every delivery_tasks INSERT/UPDATE and causes
-- an infinite recursion loop (stack depth limit exceeded) because
-- the UPSERT into available_tasks cascades back.
--
-- Migration 006 replaced available_tasks with a VIEW and no longer
-- needs this trigger. Drop it to fix the publish action.
-- ================================================================

-- Drop the trigger first, then the function
DROP TRIGGER IF EXISTS sync_available_tasks_trigger ON delivery_tasks;
DROP TRIGGER IF EXISTS trg_sync_available_tasks ON delivery_tasks;

-- Drop function (any signature)
DROP FUNCTION IF EXISTS public.sync_available_tasks() CASCADE;
