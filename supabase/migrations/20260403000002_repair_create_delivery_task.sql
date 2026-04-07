-- ================================================================
-- Migration 20260403000002: Repair create_delivery_task()
--
-- The ghost migration 20260403000001 left a stale 9-param overload.
-- Drop both overloads, re-create the correct 10-param version.
-- ================================================================

BEGIN;

-- Drop the old 9-param overload (from 20260331000002_merchant_portal)
DROP FUNCTION IF EXISTS public.create_delivery_task(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT);

-- Drop the 10-param overload too (idempotent, in case it partially exists)
DROP FUNCTION IF EXISTS public.create_delivery_task(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

-- Re-create the correct version with cart items support
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

-- Grant with full signature to avoid ambiguity
GRANT EXECUTE ON FUNCTION public.create_delivery_task(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
