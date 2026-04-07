-- ================================================================
-- Migration 20260404000001: Auto-send ePOD OTP on delivered
--
-- When a courier marks a task as "delivered", this trigger
-- automatically generates a 6-digit OTP, stores the bcrypt hash
-- in delivery_epod_otps, and calls the send-epod-otp Edge Function
-- via pg_net to email the code to the customer.
--
-- Merchant no longer needs to click "Send ePOD Code" — it's instant.
--
-- Prerequisites:
--   1. pg_net extension (ships with Supabase)
--   2. Vault secrets configured (one-time setup):
--
--      SELECT vault.create_secret('supabase_url',      'https://YOUR_PROJECT.supabase.co');
--      SELECT vault.create_secret('service_role_key',   'eyJ...');
--
-- ================================================================

-- 1. Enable pg_net (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Trigger function
CREATE OR REPLACE FUNCTION public.auto_send_epod_on_delivered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp        TEXT;
  v_otp_hash   TEXT;
  v_expires_at TIMESTAMPTZ;
  v_url        TEXT;
  v_svc_key    TEXT;
BEGIN
  -- Guard: only fire when status transitions TO 'delivered'
  IF NEW.status <> 'delivered' OR OLD.status = 'delivered' THEN
    RETURN NEW;
  END IF;

  -- Must have customer email — skip silently if not set
  IF NEW.customer_email IS NULL OR TRIM(NEW.customer_email) = '' THEN
    RAISE WARNING '[auto_epod] Task % has no customer_email — skipping OTP', NEW.id;
    RETURN NEW;
  END IF;

  -- Delete any existing un-verified OTP for this task
  DELETE FROM delivery_epod_otps
   WHERE task_id  = NEW.id
     AND verified = FALSE;

  -- Generate 6-digit OTP
  v_otp        := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  v_expires_at := NOW() + INTERVAL '10 minutes';
  v_otp_hash   := crypt(v_otp, gen_salt('bf', 8));

  -- Store hashed OTP
  INSERT INTO delivery_epod_otps (task_id, otp_hash, expires_at)
  VALUES (NEW.id, v_otp_hash, v_expires_at);

  -- Call Edge Function via pg_net to send the email
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
      RAISE WARNING '[auto_epod] Vault secrets missing — OTP stored but email NOT sent. '
                    'Run: SELECT vault.create_secret(''supabase_url'', ''https://xxx.supabase.co''); '
                    'SELECT vault.create_secret(''service_role_key'', ''eyJ...'');';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Never block the status transition — log and continue
    RAISE WARNING '[auto_epod] pg_net call failed: %. OTP stored, merchant can resend manually.', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 3. Register trigger (AFTER UPDATE so the row is committed before pg_net fires)
DROP TRIGGER IF EXISTS trg_auto_epod_on_delivered ON delivery_tasks;
CREATE TRIGGER trg_auto_epod_on_delivered
  AFTER UPDATE OF status ON delivery_tasks
  FOR EACH ROW
  WHEN (NEW.status = 'delivered')
  EXECUTE FUNCTION public.auto_send_epod_on_delivered();

-- ================================================================
-- SUMMARY
-- ================================================================
--
-- New flow:
--   Courier marks delivered  →  trigger fires  →  OTP generated + hashed
--                            →  pg_net calls Edge Function
--                            →  Edge Function sends email via Resend
--                            →  Customer receives code instantly
--                            →  Merchant enters OTP in portal  →  completed
--
-- Fallback:
--   If pg_net or vault fails, OTP is still stored in DB.
--   Merchant can click "Resend" in the portal to trigger manually.
--
-- Security:
--   ✓ Uses service_role_key from Supabase Vault (never in source code)
--   ✓ pg_net is async — never blocks the transaction
--   ✓ EXCEPTION block ensures delivery status transition always succeeds
