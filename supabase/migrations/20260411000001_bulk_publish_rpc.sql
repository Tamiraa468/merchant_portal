-- ================================================================
-- Bulk publish RPC (Phase 2 benchmark)
--
-- Adds `publish_delivery_tasks_bulk(p_task_ids uuid[])` so the merchant
-- portal can transition many draft tasks to published in a single
-- round-trip.  This is the counterpart to the existing
-- `publish_delivery_task(p_task_id uuid)` and lets us compare
-- throughput of:
--
--   1. N sequential RPC calls
--   2. N parallel RPC calls
--   3. Batched UPDATE via PostgREST (`.in('id', ids)`)
--   4. This single bulk RPC
--
-- The function is SECURITY DEFINER — so it can update rows even though
-- the `merchant_update_tasks` RLS policy would also allow it — but
-- scopes every row to the caller's `current_org_id()` so it cannot be
-- used to publish another org's tasks.
-- ================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.publish_delivery_tasks_bulk(p_task_ids UUID[])
RETURNS SETOF delivery_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_org_id();
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organisation found for the current user.';
  END IF;

  IF p_task_ids IS NULL OR array_length(p_task_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Single-statement UPDATE: at most one pass over the relevant rows,
  -- one trigger fire per row (the same as the sequential RPC would
  -- produce), returned as a set so the client can correlate IDs.
  RETURN QUERY
  UPDATE public.delivery_tasks
     SET status       = 'published',
         published_at = NOW()
   WHERE id = ANY(p_task_ids)
     AND status = 'draft'
     AND org_id = v_org_id
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_delivery_tasks_bulk(UUID[]) TO authenticated;

-- Notify PostgREST to pick up the new function in its schema cache.
NOTIFY pgrst, 'reload schema';

COMMIT;
