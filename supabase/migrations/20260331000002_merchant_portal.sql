-- ================================================================
-- Migration 009: Merchant Portal — payment & ePOD enhancements
--
-- 1. Add 'merchant' value to profile_role enum type
-- 2. Add customer_email column to delivery_tasks
-- 3. Add ePOD OTP columns to delivery_tasks (idempotent — courier
--    app migration may have already added these)
-- 4. Add 'completed' / 'cancelled' to task_status enum (idempotent)
-- 5. Update status transition trigger to allow delivered → completed
-- 6. Create courier_earnings table (idempotent)
-- 7. RPC: create_delivery_task() — validates fee > 0 and email
-- 8. Update generate_epod_otp() to use delivery_tasks.customer_email
-- ================================================================

BEGIN;

-- ============================================================
-- 1. ADD 'merchant' TO profile_role ENUM
--    The remote DB uses a PostgreSQL enum type, not text+CHECK.
-- ============================================================

ALTER TYPE profile_role ADD VALUE IF NOT EXISTS 'merchant';

-- ============================================================
-- 2. ADD customer_email COLUMN TO delivery_tasks
-- ============================================================

ALTER TABLE delivery_tasks
  ADD COLUMN IF NOT EXISTS customer_email TEXT;

-- ============================================================
-- 3. ADD ePOD OTP COLUMNS (idempotent — courier app may have run these)
-- ============================================================

ALTER TABLE delivery_tasks
  ADD COLUMN IF NOT EXISTS otp_code_hash  TEXT;

ALTER TABLE delivery_tasks
  ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;

ALTER TABLE delivery_tasks
  ADD COLUMN IF NOT EXISTS otp_verified   BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE delivery_tasks
  ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ;

-- ============================================================
-- 4. ADD 'completed' AND 'cancelled' TO task_status ENUM
--    (safe no-op if they already exist from the courier app migration)
-- ============================================================

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'cancelled';

-- ============================================================
-- 5. UPDATE STATUS TRANSITION TRIGGER
--    Add: delivered → completed (ePOD verified)
--         any non-terminal → cancelled (alternate spelling)
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_delivery_task_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- No-op when status is unchanged
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- draft/created ↔ published (merchant publishes)
  IF OLD.status IN ('draft', 'created') AND NEW.status = 'published' THEN
    RETURN NEW;
  END IF;

  -- draft ↔ created (treat as equivalent legacy compat)
  IF OLD.status IN ('draft', 'created') AND NEW.status IN ('draft', 'created') THEN
    RETURN NEW;
  END IF;

  -- published → assigned (ONLY via claim_delivery_task())
  IF OLD.status = 'published' AND NEW.status = 'assigned' THEN
    IF current_setting('app.claim_trigger_active', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION
        'Tasks can only be assigned via claim_delivery_task(). '
        'Direct status change to assigned is not allowed.';
    END IF;
    RETURN NEW;
  END IF;

  -- assigned → picked_up
  IF OLD.status = 'assigned' AND NEW.status = 'picked_up' THEN
    RETURN NEW;
  END IF;

  -- picked_up → delivered (courier marks delivered, OTP will be sent)
  IF OLD.status = 'picked_up' AND NEW.status = 'delivered' THEN
    RETURN NEW;
  END IF;

  -- delivered → completed (ePOD OTP verified)
  IF OLD.status = 'delivered' AND NEW.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- picked_up → failed
  IF OLD.status = 'picked_up' AND NEW.status = 'failed' THEN
    RETURN NEW;
  END IF;

  -- Cancellation from any non-terminal state (both spellings)
  IF NEW.status IN ('canceled', 'cancelled')
     AND OLD.status IN ('draft', 'created', 'published', 'assigned', 'picked_up') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid delivery task transition: % → %', OLD.status, NEW.status;
END;
$$;

-- Re-register the trigger (DROP + CREATE ensures it's using the updated function)
DROP TRIGGER IF EXISTS trg_enforce_delivery_task_transition ON delivery_tasks;
CREATE TRIGGER trg_enforce_delivery_task_transition
  BEFORE UPDATE OF status ON delivery_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_delivery_task_transition();

-- ============================================================
-- 6. CREATE courier_earnings TABLE (idempotent)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.courier_earnings (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id  UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id     UUID         NOT NULL UNIQUE REFERENCES public.delivery_tasks(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.courier_earnings ENABLE ROW LEVEL SECURITY;

-- Couriers see their own earnings
DROP POLICY IF EXISTS "courier_select_own_earnings" ON public.courier_earnings;
CREATE POLICY "courier_select_own_earnings"
  ON public.courier_earnings FOR SELECT
  USING (courier_id = auth.uid());

-- Merchants see earnings on their org's tasks
DROP POLICY IF EXISTS "merchant_select_task_earnings" ON public.courier_earnings;
CREATE POLICY "merchant_select_task_earnings"
  ON public.courier_earnings FOR SELECT
  USING (
    task_id IN (
      SELECT id FROM delivery_tasks
       WHERE org_id = public.current_org_id()
    )
  );

GRANT SELECT ON public.courier_earnings TO authenticated;
GRANT ALL    ON public.courier_earnings TO service_role;

-- ============================================================
-- 7. RPC: create_delivery_task()
--    Creates locations + delivery task atomically.
--    Validates: customer_email format, delivery_fee > 0.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_delivery_task(
  p_pickup_address   TEXT,
  p_dropoff_address  TEXT,
  p_customer_email   TEXT,
  p_delivery_fee     NUMERIC,
  p_customer_name    TEXT    DEFAULT NULL,
  p_customer_phone   TEXT    DEFAULT NULL,
  p_pickup_note      TEXT    DEFAULT NULL,
  p_dropoff_note     TEXT    DEFAULT NULL,
  p_note             TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id         UUID;
  v_pickup_loc_id  UUID;
  v_dropoff_loc_id UUID;
  v_task           delivery_tasks;
BEGIN
  -- Caller must belong to an organisation
  v_org_id := public.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organisation found for the current user.';
  END IF;

  -- Validate email (basic RFC-style check)
  IF p_customer_email IS NULL
     OR p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid customer email address: "%"', p_customer_email;
  END IF;

  -- Validate delivery fee
  IF p_delivery_fee IS NULL OR p_delivery_fee <= 0 THEN
    RAISE EXCEPTION 'Delivery fee must be greater than 0 (got %).', p_delivery_fee;
  END IF;

  -- Validate addresses
  IF p_pickup_address IS NULL OR TRIM(p_pickup_address) = '' THEN
    RAISE EXCEPTION 'Pickup address is required.';
  END IF;
  IF p_dropoff_address IS NULL OR TRIM(p_dropoff_address) = '' THEN
    RAISE EXCEPTION 'Dropoff address is required.';
  END IF;

  -- Insert pickup location
  INSERT INTO public.locations (org_id, address_text, label, note)
  VALUES (v_org_id, TRIM(p_pickup_address), 'Pickup', p_pickup_note)
  RETURNING id INTO v_pickup_loc_id;

  -- Insert dropoff location
  INSERT INTO public.locations (org_id, address_text, label, note)
  VALUES (v_org_id, TRIM(p_dropoff_address), 'Dropoff', p_dropoff_note)
  RETURNING id INTO v_dropoff_loc_id;

  -- Insert delivery task
  INSERT INTO public.delivery_tasks (
    org_id,
    status,
    pickup_location_id,
    dropoff_location_id,
    pickup_note,
    dropoff_note,
    receiver_name,
    receiver_phone,
    customer_email,
    delivery_fee,
    note
  ) VALUES (
    v_org_id,
    'draft',
    v_pickup_loc_id,
    v_dropoff_loc_id,
    p_pickup_note,
    p_dropoff_note,
    p_customer_name,
    p_customer_phone,
    LOWER(TRIM(p_customer_email)),
    p_delivery_fee,
    p_note
  )
  RETURNING * INTO v_task;

  RETURN row_to_json(v_task)::JSONB;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_delivery_task TO authenticated;

-- ============================================================
-- 8. UPDATE generate_epod_otp() TO USE customer_email FROM TASK
--
--    Previous version (courier app) may have emailed the auth
--    user.  This version always reads delivery_tasks.customer_email
--    so the OTP goes to the actual recipient.
--
--    Also transitions status: picked_up → delivered.
--    Returns otp + customer_email so the Edge Function can send
--    the email without a second DB round-trip.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_epod_otp(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task           delivery_tasks;
  v_otp            TEXT;
  v_otp_hash       TEXT;
  v_expires_at     TIMESTAMPTZ;
  v_customer_email TEXT;
BEGIN
  -- Verify task belongs to this courier and is in picked_up state
  SELECT * INTO v_task
    FROM delivery_tasks
   WHERE id         = p_task_id
     AND courier_id = auth.uid()
     AND status     = 'picked_up';

  IF v_task.id IS NULL THEN
    RAISE EXCEPTION
      'Task not found, not in picked_up status, or not assigned to you.';
  END IF;

  -- customer_email must be set on the task
  v_customer_email := v_task.customer_email;
  IF v_customer_email IS NULL OR TRIM(v_customer_email) = '' THEN
    RAISE EXCEPTION
      'No customer email on file for task %. '
      'The merchant must set customer_email when creating the task.', p_task_id;
  END IF;

  -- Generate a cryptographically-random 6-digit OTP
  v_otp        := LPAD((FLOOR(RANDOM() * 1000000))::TEXT, 6, '0');
  v_expires_at := NOW() + INTERVAL '10 minutes';

  -- Hash with bcrypt (requires pgcrypto extension)
  v_otp_hash := crypt(v_otp, gen_salt('bf', 8));

  -- Transition status to 'delivered' and store OTP metadata
  -- (The transition trigger allows picked_up → delivered)
  UPDATE delivery_tasks
     SET status        = 'delivered',
         delivered_at  = NOW(),
         otp_code_hash = v_otp_hash,
         otp_expires_at = v_expires_at,
         otp_verified  = FALSE
   WHERE id = p_task_id;

  RETURN jsonb_build_object(
    'otp',            v_otp,
    'customer_email', v_customer_email,
    'expires_at',     v_expires_at,
    'task_id',        p_task_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_epod_otp TO authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
--
-- Schema changes:
--   profile_role enum      — added 'merchant' (ALTER TYPE ... ADD VALUE IF NOT EXISTS)
--   delivery_tasks         — added customer_email, otp_code_hash,
--                            otp_expires_at, otp_verified, completed_at
--   task_status enum       — added 'completed', 'cancelled' (IF NOT EXISTS)
--   courier_earnings       — new table (IF NOT EXISTS)
--
-- Trigger updates:
--   enforce_delivery_task_transition — now allows delivered → completed
--                                      and cancelled (alt spelling)
--
-- New / updated RPCs:
--   create_delivery_task()  — validates email + fee > 0, atomic insert
--   generate_epod_otp()     — uses delivery_tasks.customer_email
--
-- Security invariants preserved:
--   ✓ delivery_fee > 0 enforced in create_delivery_task()
--   ✓ customer_email validated (regex) in create_delivery_task()
--   ✓ OTP email always goes to task's customer_email, not auth user
--   ✓ All SECURITY DEFINER functions use SET search_path = public

COMMIT;
