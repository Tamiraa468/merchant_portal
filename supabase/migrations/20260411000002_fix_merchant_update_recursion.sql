-- ================================================================
-- Fix: infinite-recursion RLS policy on delivery_tasks
--
-- Before:  `merchant_update_tasks` WITH CHECK clause contained a
--          self-referencing subquery on delivery_tasks:
--            courier_id = (SELECT courier_id FROM delivery_tasks
--                          WHERE id = delivery_tasks.id)
--          Any direct UPDATE issued by an authenticated merchant via
--          PostgREST fails with SQLSTATE 42P17 "infinite recursion
--          detected in policy for relation delivery_tasks".
--
-- The single-task `publish_delivery_task(uuid)` RPC is SECURITY
-- DEFINER and therefore runs under `postgres`, not the caller, which
-- silently bypasses the recursive policy.  So the bug only manifests
-- when the client tries a plain UPDATE (for example a bulk-publish
-- benchmark, or a future "edit task" UI that does not go through the
-- RPC).  Replacing the subquery with a BEFORE UPDATE trigger gives
-- the same protection without the recursive RLS evaluation.
-- ================================================================

BEGIN;

-- Drop the recursive policy.
DROP POLICY IF EXISTS "merchant_update_tasks" ON public.delivery_tasks;

-- Simpler replacement — just scope UPDATE to the caller's org.
CREATE POLICY "merchant_update_tasks"
  ON public.delivery_tasks FOR UPDATE
  USING     (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

-- Prevent merchants from manually setting or changing `courier_id`.
-- Only `claim_delivery_task()` (which sets app.claim_trigger_active='true'
-- inside a SECURITY DEFINER body) is allowed to assign a courier.
CREATE OR REPLACE FUNCTION public.enforce_merchant_courier_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.courier_id IS DISTINCT FROM OLD.courier_id
     AND current_setting('app.claim_trigger_active', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'courier_id can only be changed via claim_delivery_task(). '
      'Direct assignment by merchants is not allowed.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merchant_courier_immutable ON public.delivery_tasks;
CREATE TRIGGER trg_merchant_courier_immutable
  BEFORE UPDATE OF courier_id ON public.delivery_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_merchant_courier_immutable();

NOTIFY pgrst, 'reload schema';

COMMIT;
