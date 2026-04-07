-- ================================================================
-- Migration 20260406000002: Fix pgcrypto search_path
--
-- SECURITY DEFINER functions that use crypt() / gen_salt() had
-- search_path = public, but pgcrypto is installed in the
-- "extensions" schema on Supabase.  Add "extensions" to the
-- search_path for all three ePOD functions.
-- ================================================================

-- 1. request_epod_otp — used by merchant to send OTP manually
CREATE OR REPLACE FUNCTION public.request_epod_otp(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_task       delivery_tasks;
  v_otp        TEXT;
  v_otp_hash   TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
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

  IF v_task.epod_request_count >= 3 THEN
    RAISE EXCEPTION
      'Maximum OTP request limit reached (3 per delivery). '
      'Contact support if you need assistance completing this delivery.';
  END IF;

  DELETE FROM delivery_epod_otps
   WHERE task_id  = p_task_id
     AND verified = FALSE;

  v_otp        := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  v_expires_at := NOW() + INTERVAL '10 minutes';
  v_otp_hash   := crypt(v_otp, gen_salt('bf', 8));

  INSERT INTO delivery_epod_otps (task_id, otp_hash, expires_at)
  VALUES (p_task_id, v_otp_hash, v_expires_at);

  UPDATE delivery_tasks
     SET epod_request_count = epod_request_count + 1
   WHERE id = p_task_id;

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

-- 2. verify_epod_otp — used by merchant to verify customer OTP
CREATE OR REPLACE FUNCTION public.verify_epod_otp(
  p_task_id UUID,
  p_otp     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_epod  delivery_epod_otps;
  v_task  delivery_tasks;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- PRIMARY: delivery_epod_otps (merchant-portal flow)
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

    UPDATE delivery_epod_otps
       SET attempts = attempts + 1
     WHERE id = v_epod.id;

    IF crypt(p_otp, v_epod.otp_hash) IS DISTINCT FROM v_epod.otp_hash THEN
      RAISE EXCEPTION 'Invalid verification code. % attempt(s) remaining.',
        GREATEST(0, 5 - (v_epod.attempts + 1));
    END IF;

    UPDATE delivery_epod_otps
       SET verified = TRUE
     WHERE id = v_epod.id;

    UPDATE delivery_tasks
       SET status       = 'completed',
           completed_at = NOW()
     WHERE id     = p_task_id
       AND status = 'delivered';

    RETURN jsonb_build_object('success', TRUE, 'task_id', p_task_id);
  END IF;

  -- FALLBACK: delivery_tasks inline columns (courier-app flow)
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

  UPDATE delivery_tasks
     SET otp_verified = TRUE,
         status       = 'completed',
         completed_at = NOW()
   WHERE id = p_task_id;

  RETURN jsonb_build_object('success', TRUE, 'task_id', p_task_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_epod_otp TO authenticated;

-- 3. auto_send_epod_on_delivered — trigger function
CREATE OR REPLACE FUNCTION public.auto_send_epod_on_delivered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_otp        TEXT;
  v_otp_hash   TEXT;
  v_expires_at TIMESTAMPTZ;
  v_url        TEXT;
  v_svc_key    TEXT;
BEGIN
  IF NEW.status <> 'delivered' OR OLD.status = 'delivered' THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_email IS NULL OR TRIM(NEW.customer_email) = '' THEN
    RAISE WARNING '[auto_epod] Task % has no customer_email — skipping OTP', NEW.id;
    RETURN NEW;
  END IF;

  DELETE FROM delivery_epod_otps
   WHERE task_id  = NEW.id
     AND verified = FALSE;

  v_otp        := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  v_expires_at := NOW() + INTERVAL '10 minutes';
  v_otp_hash   := crypt(v_otp, gen_salt('bf', 8));

  INSERT INTO delivery_epod_otps (task_id, otp_hash, expires_at)
  VALUES (NEW.id, v_otp_hash, v_expires_at);

  BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets
     WHERE name = 'supabase_url'
     LIMIT 1;

    SELECT decrypted_secret INTO v_svc_key
      FROM vault.decrypted_secrets
     WHERE name = 'service_role_key'
     LIMIT 1;

    IF v_url IS NOT NULL AND v_svc_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/send-epod-otp',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_svc_key
        ),
        body    := jsonb_build_object(
          'task_id',        NEW.id,
          'otp',            v_otp,
          'customer_email', NEW.customer_email,
          'auto_triggered', TRUE
        )
      );
    ELSE
      RAISE WARNING '[auto_epod] Vault secrets missing — OTP stored but email NOT sent.';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[auto_epod] pg_net call failed: %. OTP stored, merchant can resend manually.', SQLERRM;
  END;

  RETURN NEW;
END;
$$;
