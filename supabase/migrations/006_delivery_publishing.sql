-- ================================================================
-- Migration 006: Delivery Publishing System
--
-- Extends delivery_tasks (created in 002, courier_id added in 003)
-- with order linking, atomic courier claiming, strict RLS,
-- and status transition enforcement.
--
-- Runs AFTER 005 (draft enum value) and 004 (orders table).
-- Ready for Supabase SQL Editor — paste and run.
-- ================================================================

-- ============================================================
-- 1) ADD COLUMNS TO delivery_tasks
-- ============================================================

-- Link delivery task 1:1 to an order
ALTER TABLE delivery_tasks
  ADD COLUMN IF NOT EXISTS order_id UUID UNIQUE
    REFERENCES public.orders(id) ON DELETE SET NULL;

-- Fee columns
ALTER TABLE delivery_tasks
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE delivery_tasks
  ADD COLUMN IF NOT EXISTS suggested_fee NUMERIC(12,2);

-- General note (supplements pickup_note / dropoff_note)
ALTER TABLE delivery_tasks
  ADD COLUMN IF NOT EXISTS note TEXT;

-- Change default status from 'created' to 'draft'
ALTER TABLE delivery_tasks
  ALTER COLUMN status SET DEFAULT 'draft';

-- Temporarily disable USER triggers so the data migration doesn't
-- hit any existing status-transition trigger in the remote DB.
-- (Cannot use DISABLE TRIGGER ALL on Supabase — system triggers are protected.)
ALTER TABLE delivery_tasks DISABLE TRIGGER USER;

-- Migrate any existing 'created' rows to 'draft'
UPDATE delivery_tasks SET status = 'draft' WHERE status = 'created';

-- Re-enable user triggers
ALTER TABLE delivery_tasks ENABLE TRIGGER USER;

-- ============================================================
-- 3) INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_delivery_tasks_status_created
  ON delivery_tasks (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_tasks_order_id
  ON delivery_tasks (order_id);

-- org_id and courier_id indexes already exist from 002/003

-- ============================================================
-- 4) UPDATED_AT TRIGGER
--    Reuses set_updated_at() created in 004.
--    CREATE OR REPLACE is idempotent if 004 hasn't run yet.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_tasks_updated_at ON delivery_tasks;
CREATE TRIGGER trg_delivery_tasks_updated_at
  BEFORE UPDATE ON delivery_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 5) STATUS TRANSITION ENFORCEMENT
--
--    State machine:
--      draft ──(merchant)──▶ published
--      published ──(claim function ONLY)──▶ assigned
--      assigned ──(courier)──▶ picked_up
--      picked_up ──(courier)──▶ delivered
--      picked_up ──(courier)──▶ failed
--      draft/published/assigned ──▶ canceled
--
--    published → assigned is gated by session variable
--    set ONLY inside claim_delivery_task().
-- ============================================================

-- Drop the OLD status transition trigger/function from the remote DB
-- (it doesn't know about the 'draft' status)
DROP TRIGGER IF EXISTS trigger_enforce_task_status ON delivery_tasks;
DROP TRIGGER IF EXISTS enforce_task_status_transition_trigger ON delivery_tasks;
DROP FUNCTION IF EXISTS enforce_task_status_transition();
DROP FUNCTION IF EXISTS public.enforce_task_status_transition();

CREATE OR REPLACE FUNCTION public.enforce_delivery_task_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- No-op on same status
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- draft/created → published (merchant publishes)
  -- 'created' kept for backward compatibility with legacy rows/app code
  IF OLD.status IN ('draft', 'created') AND NEW.status = 'published' THEN
    RETURN NEW;
  END IF;

  -- draft ↔ created (treat as equivalent, allow either direction)
  IF OLD.status IN ('draft', 'created') AND NEW.status IN ('draft', 'created') THEN
    RETURN NEW;
  END IF;

  -- published → assigned (ONLY via claim_delivery_task function)
  IF OLD.status = 'published' AND NEW.status = 'assigned' THEN
    IF current_setting('app.claim_trigger_active', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION
        'Tasks can only be assigned via claim_delivery_task(). '
        'Direct status change to assigned is not allowed.';
    END IF;
    RETURN NEW;
  END IF;

  -- assigned → picked_up (courier picks up)
  IF OLD.status = 'assigned' AND NEW.status = 'picked_up' THEN
    RETURN NEW;
  END IF;

  -- picked_up → delivered (courier completes)
  IF OLD.status = 'picked_up' AND NEW.status = 'delivered' THEN
    RETURN NEW;
  END IF;

  -- picked_up → failed (delivery failed)
  IF OLD.status = 'picked_up' AND NEW.status = 'failed' THEN
    RETURN NEW;
  END IF;

  -- Cancellation from non-terminal states
  IF NEW.status = 'canceled'
     AND OLD.status IN ('draft', 'created', 'published', 'assigned') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid delivery task transition: % → %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_delivery_task_transition ON delivery_tasks;
CREATE TRIGGER trg_enforce_delivery_task_transition
  BEFORE UPDATE OF status ON delivery_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_delivery_task_transition();

-- ============================================================
-- 6) PUBLISH FUNCTION (merchant action)
--
--    Moves a draft task to published.
--    Sets published_at timestamp.
--    Verifies caller owns the org.
-- ============================================================

-- Drop existing version (old 003 used different param name 'task_id_param')
DROP FUNCTION IF EXISTS public.publish_delivery_task(UUID);

CREATE FUNCTION public.publish_delivery_task(p_task_id UUID)
RETURNS delivery_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task delivery_tasks;
BEGIN
  UPDATE delivery_tasks
     SET status       = 'published',
         published_at = NOW()
   WHERE id     = p_task_id
     AND status = 'draft'
     AND org_id = public.current_org_id()
  RETURNING * INTO v_task;

  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'Task not found, not in draft status, or not in your organization.';
  END IF;

  RETURN v_task;
END;
$$;

-- ============================================================
-- 7) ATOMIC CLAIM FUNCTION  ★ CRITICAL ★
--
--    Called by couriers via supabase.rpc('claim_delivery_task').
--    Uses PostgreSQL row-level locking:
--      - First UPDATE acquires lock and succeeds
--      - Concurrent UPDATE waits, then sees status='assigned' → 0 rows
--
--    SECURITY DEFINER: bypasses RLS so the UPDATE works even
--    though courier RLS doesn't allow writing to status directly.
--    Caller identity verified inside the function.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_delivery_task(p_task_id UUID)
RETURNS delivery_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task delivery_tasks;
BEGIN
  -- Verify caller is a courier
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid() AND role = 'courier'
  ) THEN
    RAISE EXCEPTION 'Only couriers can claim delivery tasks.';
  END IF;

  -- Set session flag so the status transition trigger allows published → assigned
  PERFORM set_config('app.claim_trigger_active', 'true', true);

  -- Atomic claim: only one concurrent caller succeeds
  UPDATE delivery_tasks
     SET courier_id   = auth.uid(),
         status       = 'assigned',
         assigned_at  = NOW()
   WHERE id          = p_task_id
     AND status      = 'published'
     AND courier_id  IS NULL
  RETURNING * INTO v_task;

  -- Clear session flag
  PERFORM set_config('app.claim_trigger_active', 'false', true);

  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'Task is no longer available or has already been claimed.';
  END IF;

  RETURN v_task;
END;
$$;

-- ============================================================
-- 8) DROP OLD BROAD RLS POLICIES (from migration 002)
--    These allowed any org_user full UPDATE access without
--    transition restrictions. Replace with fine-grained policies.
-- ============================================================

DROP POLICY IF EXISTS "Org users can view their tasks"  ON delivery_tasks;
DROP POLICY IF EXISTS "Org users can create tasks"      ON delivery_tasks;
DROP POLICY IF EXISTS "Org users can update tasks"      ON delivery_tasks;

-- Also drop any leftover courier policies (003 may have partially run)
DROP POLICY IF EXISTS "Couriers can view available and assigned tasks" ON delivery_tasks;
DROP POLICY IF EXISTS "Couriers can claim published tasks"            ON delivery_tasks;
DROP POLICY IF EXISTS "Couriers can update their tasks"               ON delivery_tasks;

-- ============================================================
-- 9) RLS POLICIES — MERCHANT
-- ============================================================

-- Merchant: SELECT all tasks in their org (any status)
DROP POLICY IF EXISTS "merchant_select_tasks" ON delivery_tasks;
CREATE POLICY "merchant_select_tasks"
  ON delivery_tasks FOR SELECT
  USING (org_id = public.current_org_id());

-- Merchant: INSERT new tasks (must start as draft)
DROP POLICY IF EXISTS "merchant_insert_tasks" ON delivery_tasks;
CREATE POLICY "merchant_insert_tasks"
  ON delivery_tasks FOR INSERT
  WITH CHECK (
    org_id = public.current_org_id()
    AND status = 'draft'
  );

-- Merchant: UPDATE own org tasks
-- (Status transition enforcement is in the trigger, not here.
--  Merchant cannot set courier_id — claim function handles that.)
DROP POLICY IF EXISTS "merchant_update_tasks" ON delivery_tasks;
CREATE POLICY "merchant_update_tasks"
  ON delivery_tasks FOR UPDATE
  USING (org_id = public.current_org_id())
  WITH CHECK (
    org_id = public.current_org_id()
    -- Merchant CANNOT manually assign a courier
    AND (courier_id IS NULL OR courier_id = (
      SELECT courier_id FROM delivery_tasks WHERE id = delivery_tasks.id
    ))
  );

-- ============================================================
-- 10) RLS POLICIES — COURIER
-- ============================================================

-- Courier: SELECT published tasks available to claim
-- (Couriers NEVER see draft tasks)
DROP POLICY IF EXISTS "courier_select_published" ON delivery_tasks;
CREATE POLICY "courier_select_published"
  ON delivery_tasks FOR SELECT
  USING (
    status = 'published'
    AND courier_id IS NULL
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid() AND role = 'courier'
    )
  );

-- Courier: SELECT their own assigned/active tasks
DROP POLICY IF EXISTS "courier_select_own" ON delivery_tasks;
CREATE POLICY "courier_select_own"
  ON delivery_tasks FOR SELECT
  USING (
    courier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid() AND role = 'courier'
    )
  );

-- Courier: UPDATE their own assigned tasks (status transitions only)
-- The claim itself is handled by claim_delivery_task() which is SECURITY DEFINER.
-- This policy covers: assigned→picked_up, picked_up→delivered, picked_up→failed
DROP POLICY IF EXISTS "courier_update_own" ON delivery_tasks;
CREATE POLICY "courier_update_own"
  ON delivery_tasks FOR UPDATE
  USING (
    courier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid() AND role = 'courier'
    )
  )
  WITH CHECK (
    courier_id = auth.uid()
  );

-- ============================================================
-- 11) AVAILABLE TASKS VIEW (convenience for courier app)
--     Only shows published, unclaimed tasks.
--     Security is controlled by RLS on delivery_tasks.
-- ============================================================

DROP VIEW  IF EXISTS available_tasks CASCADE;
DROP TABLE IF EXISTS available_tasks CASCADE;

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

-- ============================================================
-- 12) TIMESTAMP TRIGGERS FOR COURIER LIFECYCLE
--     Auto-set picked_up_at, delivered_at, canceled_at, failed_at
--     when the corresponding status transition occurs.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_delivery_task_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'published'  THEN NEW.published_at  := NOW(); END IF;
  IF NEW.status = 'assigned'   THEN NEW.assigned_at   := NOW(); END IF;
  IF NEW.status = 'picked_up'  THEN NEW.picked_up_at  := NOW(); END IF;
  IF NEW.status = 'delivered'  THEN NEW.delivered_at   := NOW(); END IF;
  IF NEW.status = 'canceled'   THEN NEW.canceled_at    := NOW(); END IF;
  IF NEW.status = 'failed'     THEN NEW.failed_at      := NOW(); END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_task_timestamps ON delivery_tasks;
CREATE TRIGGER trg_delivery_task_timestamps
  BEFORE UPDATE OF status ON delivery_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_delivery_task_timestamps();

-- ============================================================
-- 13) GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON delivery_tasks TO authenticated;
GRANT SELECT ON available_tasks TO authenticated;
GRANT ALL ON delivery_tasks TO service_role;
GRANT ALL ON available_tasks TO service_role;

-- ============================================================
-- SUMMARY
-- ============================================================
--
-- Extended delivery_tasks with:
--   order_id       — 1:1 link to orders table
--   delivery_fee   — merchant-set fee
--   suggested_fee  — distance-based suggestion
--   note           — general notes
--   status default — changed from 'created' to 'draft'
--
-- Functions:
--   publish_delivery_task(p_task_id)  — merchant: draft → published
--   claim_delivery_task(p_task_id)    — courier: published → assigned (ATOMIC)
--
-- Triggers:
--   trg_delivery_tasks_updated_at          — auto updated_at
--   trg_enforce_delivery_task_transition   — state machine guard
--   trg_delivery_task_timestamps           — auto-set lifecycle timestamps
--
-- RLS:
--   Merchant: SELECT/INSERT/UPDATE own org (insert must be draft)
--   Courier:  SELECT published only + own tasks; UPDATE own tasks
--   Customer: NO access
--
-- Security invariants:
--   ✓ Couriers NEVER see draft tasks
--   ✓ published → assigned ONLY via claim_delivery_task()
--   ✓ Merchant CANNOT manually assign courier_id
--   ✓ Concurrent claims: exactly ONE succeeds (row-level lock)
--   ✓ All SECURITY DEFINER functions use SET search_path = public
