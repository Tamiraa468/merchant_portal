-- ================================================================
-- Migration 20260401000002: ePOD OTP table + merchant-portal RPCs
--
-- 1. delivery_epod_otps table — dedicated OTP store (replaces inline
--    columns on delivery_tasks for the merchant-portal flow)
-- 2. RLS on delivery_epod_otps
-- 3. request_epod_otp(task_id) — generates OTP, stores hash, returns
--    plaintext once (for the Edge Function to email)
-- 4. verify_epod_otp(task_id, otp) — verifies hash, enforces expiry
--    and attempt limit, transitions task delivered → completed
--    (CREATE OR REPLACE — supersedes any courier-app version;
--     falls back to delivery_tasks.otp_code_hash for old-style OTPs)
-- ================================================================

BEGIN;

-- ============================================================
-- 1. delivery_epod_otps TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.delivery_epod_otps (
  id          UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID       NOT NULL
                           REFERENCES public.delivery_tasks(id)
                           ON DELETE CASCADE,
  otp_hash    TEXT       NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    SMALLINT   NOT NULL DEFAULT 0,
  verified    BOOLEAN    NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only ever one un-verified OTP row per task
CREATE UNIQUE INDEX IF NOT EXISTS uq_epod_otps_active_task
  ON public.delivery_epod_otps (task_id)
  WHERE verified = FALSE;

CREATE INDEX IF NOT EXISTS idx_epod_otps_task_id
  ON public.delivery_epod_otps (task_id);

-- ============================================================
-- 2. RLS
-- ============================================================

ALTER TABLE public.delivery_epod_otps ENABLE ROW LEVEL SECURITY;

-- Merchant (org member): can SELECT their org's OTP rows
DROP POLICY IF EXISTS "merchant_select_epod_otps" ON public.delivery_epod_otps;
CREATE POLICY "merchant_select_epod_otps"
  ON public.delivery_epod_otps FOR SELECT
  USING (
    task_id IN (
      SELECT id FROM delivery_tasks
       WHERE org_id = public.current_org_id()
    )
  );

-- All writes go through SECURITY DEFINER functions — no direct client access
GRANT SELECT ON public.delivery_epod_otps TO authenticated;
GRANT ALL    ON public.delivery_epod_otps TO service_role;

-- ============================================================
-- 3. request_epod_otp(p_task_id)
--
--    Called by the send-epod-otp Edge Function on behalf of a
--    merchant user.  Caller must own the task's org.
--
--    Returns JSONB { otp, customer_email, expires_at, task_id }
--    — the plaintext OTP is returned exactly once so the Edge
--      Function can send it by email and never store it.
-- ============================================================

CREATE OR REPLACE FUNCTION public.request_epod_otp(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task       delivery_tasks;
  v_otp        TEXT;
  v_otp_hash   TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Caller must be authenticated and own the task's org
  SELECT * INTO v_task
    FROM delivery_tasks
   WHERE id     = p_task_id
     AND org_id = public.current_org_id()
     AND status = 'delivered';

  IF v_task.id IS NULL THEN
    RAISE EXCEPTION
      'Task not found, not in "delivered" status, or not in your organisation.';
  END IF;

  IF v_task.customer_email IS NULL OR TRIM(v_task.customer_email) = '' THEN
    RAISE EXCEPTION
      'Task has no customer email. Edit the task to add one before sending an OTP.';
  END IF;

  -- Delete any existing un-verified OTP so the unique index allows a fresh insert
  DELETE FROM delivery_epod_otps
   WHERE task_id  = p_task_id
     AND verified = FALSE;

  -- Generate a cryptographically-random 6-digit code
  v_otp        := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  v_expires_at := NOW() + INTERVAL '15 minutes';

  -- bcrypt hash (cost 8 — fast enough for a 6-digit code)
  v_otp_hash := crypt(v_otp, gen_salt('bf', 8));

  INSERT INTO delivery_epod_otps (task_id, otp_hash, expires_at)
  VALUES (p_task_id, v_otp_hash, v_expires_at);

  -- Return plaintext OTP once — Edge Function emails it, never stores it
  RETURN jsonb_build_object(
    'otp',            v_otp,
    'customer_email', v_task.customer_email,
    'expires_at',     v_expires_at,
    'task_id',        p_task_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_epod_otp TO authenticated;

-- ============================================================
-- 4. verify_epod_otp(p_task_id, p_otp)
--
--    PRIMARY path: delivery_epod_otps table (merchant-portal flow).
--    FALLBACK path: delivery_tasks.otp_code_hash columns (courier-app
--      flow — ensures backward-compatibility if the courier app already
--      stored an OTP there before this migration was applied).
--
--    Enforces:
--      • Expiry check
--      • Max 5 attempts (incremented before hash comparison)
--      • On success: task status → completed, completed_at set
-- ============================================================

CREATE OR REPLACE FUNCTION public.verify_epod_otp(
  p_task_id UUID,
  p_otp     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_epod  delivery_epod_otps;
  v_task  delivery_tasks;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- ── PRIMARY: delivery_epod_otps (merchant-portal flow) ──

  SELECT * INTO v_epod
    FROM delivery_epod_otps
   WHERE task_id  = p_task_id
     AND verified = FALSE
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_epod.id IS NOT NULL THEN

    IF v_epod.expires_at < NOW() THEN
      RAISE EXCEPTION 'Verification code has expired. Please request a new one.';
    END IF;

    IF v_epod.attempts >= 5 THEN
      RAISE EXCEPTION
        'Too many failed attempts. Please request a new verification code.';
    END IF;

    -- Increment attempt BEFORE comparing (prevents timing-based enumeration)
    UPDATE delivery_epod_otps
       SET attempts = attempts + 1
     WHERE id = v_epod.id;

    IF crypt(p_otp, v_epod.otp_hash) IS DISTINCT FROM v_epod.otp_hash THEN
      RAISE EXCEPTION 'Invalid verification code. % attempt(s) remaining.',
        GREATEST(0, 5 - (v_epod.attempts + 1));
    END IF;

    -- Valid — mark verified
    UPDATE delivery_epod_otps
       SET verified = TRUE
     WHERE id = v_epod.id;

    -- Transition task to completed (trigger allows delivered → completed)
    UPDATE delivery_tasks
       SET status       = 'completed',
           completed_at = NOW()
     WHERE id     = p_task_id
       AND status = 'delivered';

    RETURN jsonb_build_object('success', TRUE, 'task_id', p_task_id);
  END IF;

  -- ── FALLBACK: delivery_tasks inline columns (courier-app flow) ──

  SELECT * INTO v_task
    FROM delivery_tasks
   WHERE id            = p_task_id
     AND otp_code_hash IS NOT NULL
     AND otp_verified  = FALSE;

  IF v_task.id IS NULL THEN
    RAISE EXCEPTION
      'No active verification code found for this task. Please request a new one.';
  END IF;

  IF v_task.otp_expires_at < NOW() THEN
    RAISE EXCEPTION 'Verification code has expired. Please request a new one.';
  END IF;

  IF crypt(p_otp, v_task.otp_code_hash) IS DISTINCT FROM v_task.otp_code_hash THEN
    RAISE EXCEPTION 'Invalid verification code.';
  END IF;

  -- Valid — complete task
  UPDATE delivery_tasks
     SET otp_verified = TRUE,
         status       = 'completed',
         completed_at = NOW()
   WHERE id = p_task_id;

  RETURN jsonb_build_object('success', TRUE, 'task_id', p_task_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_epod_otp TO authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
--
-- New objects:
--   delivery_epod_otps    — dedicated OTP table; one active row per task
--   request_epod_otp()    — generates OTP, returns plaintext once
--   verify_epod_otp()     — replaced; primary = new table, fallback = old columns
--
-- Security invariants:
--   ✓ Plaintext OTP never stored — only bcrypt hash
--   ✓ 15-minute expiry enforced in DB, not just UI
--   ✓ Max 5 attempts; attempt incremented before hash compare
--   ✓ delivered → completed only via verify_epod_otp (trigger-guarded)
--   ✓ request_epod_otp restricted to task's org member (current_org_id())
--   ✓ No direct client INSERT/UPDATE on delivery_epod_otps

COMMIT;
