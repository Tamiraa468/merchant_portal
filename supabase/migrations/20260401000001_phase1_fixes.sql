-- ================================================================
-- Migration: Phase 1 fixes
--
-- 1. Normalize 'canceled' → 'cancelled' in existing rows
-- 2. Extend create_delivery_task() to accept p_cart_items JSONB
--    so task + items are created in a single atomic transaction.
-- 3. Add org_settings table for store settings (Phase 2 prep).
-- 4. Add unavailable_until column to products (Phase 2 prep).
-- ================================================================

BEGIN;

-- ============================================================
-- 1. NORMALIZE canceled → cancelled
-- ============================================================

UPDATE public.delivery_tasks
   SET status = 'cancelled'
 WHERE status = 'canceled';

-- ============================================================
-- 2. EXTEND create_delivery_task() WITH ATOMIC CART ITEMS
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
  p_note             TEXT    DEFAULT NULL,
  -- NEW: cart items array [{product_id: UUID, qty: int}]
  p_cart_items       JSONB   DEFAULT NULL
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
  v_item           JSONB;
  v_product_id     UUID;
  v_qty            INTEGER;
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

  -- Insert cart items atomically if provided
  IF p_cart_items IS NOT NULL AND jsonb_array_length(p_cart_items) > 0 THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_cart_items)
    LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_qty        := (v_item->>'qty')::INTEGER;

      -- Basic validation
      IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'Cart item missing product_id.';
      END IF;
      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Cart item qty must be > 0 (got %).', v_qty;
      END IF;

      INSERT INTO public.task_items (task_id, product_id, qty)
      VALUES (v_task.id, v_product_id, v_qty);
    END LOOP;
  END IF;

  RETURN row_to_json(v_task)::JSONB;
END;
$$;

-- Full signature required: 20260331000002 left a 9-arg overload in place,
-- and CREATE OR REPLACE above actually installs a *second* 10-arg function
-- rather than replacing it. Ambiguous unqualified GRANT fails on SQLSTATE
-- 42725. 20260403000002_repair_create_delivery_task drops both overloads
-- and rebuilds cleanly; this grant just needs to survive until then.
GRANT EXECUTE ON FUNCTION public.create_delivery_task(
  TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO authenticated;

-- ============================================================
-- 3. ORG SETTINGS TABLE (Phase 2 prep)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.org_settings (
  org_id              UUID         PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_name          TEXT,
  store_address       TEXT,
  store_phone         TEXT,
  store_description   TEXT,
  logo_url            TEXT,
  is_accepting_orders BOOLEAN      NOT NULL DEFAULT TRUE,
  -- Weekly hours: stored as JSONB [{day: 0-6, open: "09:00", close: "21:00", closed: bool}]
  weekly_hours        JSONB        NOT NULL DEFAULT '[]'::JSONB,
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant_manage_own_settings" ON public.org_settings;
CREATE POLICY "merchant_manage_own_settings"
  ON public.org_settings
  FOR ALL
  USING  (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

GRANT SELECT, INSERT, UPDATE ON public.org_settings TO authenticated;
GRANT ALL ON public.org_settings TO service_role;

-- ============================================================
-- 4. PRODUCT AVAILABILITY (Phase 2 prep)
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unavailable_until TIMESTAMPTZ;

COMMIT;
