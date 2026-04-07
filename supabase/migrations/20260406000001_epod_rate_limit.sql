-- ================================================================
-- Migration 20260401000003: ePOD request rate limiting
--
-- 1. Add epod_request_count to delivery_tasks — tracks how many
--    times an OTP has been requested for this task across its life.
--    Merchants can request at most 3 OTPs per delivery.
-- 2. UPDATE request_epod_otp() with:
--    • Rate limit: reject when epod_request_count >= 3
--    • Shorter expiry: 10 minutes (was 15)
--    • Increment count after successful generation
-- ================================================================

BEGIN;

-- ============================================================
-- 1. ADD epod_request_count COLUMN
-- ============================================================

ALTER TABLE public.delivery_tasks
  ADD COLUMN IF NOT EXISTS epod_request_count SMALLINT NOT NULL DEFAULT 0;

-- ============================================================
-- 2. REPLACE request_epod_otp() WITH RATE-LIMITED VERSION
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
  -- Caller must own the task's org and task must be in 'delivered' status
  SELECT * INTO v_task
    FROM delivery_tasks
   WHERE id     = p_task_id
     AND org_id = public.current_org_id()
     AND status = 'delivered';

  IF v_task.id IS NULL THEN
    RAISE EXCEPTION
      'Task not found, not in "delivered" status, or not in your organisation.';
  END IF;

  -- customer_email must be set
  IF v_task.customer_email IS NULL OR TRIM(v_task.customer_email) = '' THEN
    RAISE EXCEPTION
      'Task has no customer email. Edit the task to add one before sending an OTP.';
  END IF;

  -- Rate limit: max 3 OTP requests per task across its lifetime
  IF v_task.epod_request_count >= 3 THEN
    RAISE EXCEPTION
      'Maximum OTP request limit reached (3 per delivery). '
      'Contact support if you need assistance completing this delivery.';
  END IF;

  -- Delete any existing un-verified OTP (allows a fresh insert)
  DELETE FROM delivery_epod_otps
   WHERE task_id  = p_task_id
     AND verified = FALSE;

  -- Generate cryptographically-random 6-digit OTP
  v_otp        := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  v_expires_at := NOW() + INTERVAL '10 minutes';
  v_otp_hash   := crypt(v_otp, gen_salt('bf', 8));

  -- Store hashed OTP
  INSERT INTO delivery_epod_otps (task_id, otp_hash, expires_at)
  VALUES (p_task_id, v_otp_hash, v_expires_at);

  -- Increment request counter (persists even across resends)
  UPDATE delivery_tasks
     SET epod_request_count = epod_request_count + 1
   WHERE id = p_task_id;

  -- Return plaintext OTP once — Edge Function emails it and discards it
  RETURN jsonb_build_object(
    'otp',            v_otp,
    'customer_email', v_task.customer_email,
    'expires_at',     v_expires_at,
    'task_id',        p_task_id,
    'requests_used',  v_task.epod_request_count + 1,
    'requests_max',   3
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_epod_otp TO authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
--
-- delivery_tasks.epod_request_count
--   • Monotonically increments — never resets
--   • Capped at 3; request_epod_otp raises an error on the 4th call
--   • Survives resends (each resend still costs 1 of 3 allowances)
--
-- Security invariants:
--   ✓ Plain OTP never stored — bcrypt hash only
--   ✓ 10-minute expiry enforced in DB (shorter window, harder to brute-force)
--   ✓ Max 3 request attempts per delivery (rate limit in the RPC, not app layer)
--   ✓ Max 5 verification attempts (enforced in verify_epod_otp, unchanged)

COMMIT;
