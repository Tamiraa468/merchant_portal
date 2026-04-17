-- ================================================================
-- Migration: align create_delivery_task() with current task_items schema
--
-- The task_items table's real columns are:
--   task_id, product_id, product_name, unit_price, quantity, total_price
--
-- The RPC was built against an older draft schema (task_id, product_id,
-- qty) and so every call with cart items fails with:
--   ERROR: column "qty" of relation "task_items" does not exist
--
-- Fix: look up the product's name + price by id, compute total_price,
-- and insert into the correct columns. Also verify the product belongs
-- to the caller's organisation before inserting (prevents a user from
-- attaching another org's product via a crafted cart).
-- ================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.create_delivery_task(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE FUNCTION public.create_delivery_task(
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
  v_org_id          UUID;
  v_pickup_loc_id   UUID;
  v_dropoff_loc_id  UUID;
  v_task            delivery_tasks;
  v_item            JSONB;
  v_product_id      UUID;
  v_qty             INTEGER;
  v_product_name    TEXT;
  v_product_price   NUMERIC(10,2);
BEGIN
  v_org_id := public.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organisation found for the current user.';
  END IF;

  IF p_customer_email IS NULL
     OR p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid customer email address: "%"', p_customer_email;
  END IF;

  IF p_delivery_fee IS NULL OR p_delivery_fee <= 0 THEN
    RAISE EXCEPTION 'Delivery fee must be greater than 0 (got %).', p_delivery_fee;
  END IF;

  IF p_pickup_address IS NULL OR TRIM(p_pickup_address) = '' THEN
    RAISE EXCEPTION 'Pickup address is required.';
  END IF;
  IF p_dropoff_address IS NULL OR TRIM(p_dropoff_address) = '' THEN
    RAISE EXCEPTION 'Dropoff address is required.';
  END IF;

  INSERT INTO public.locations (org_id, address_text, label, note)
  VALUES (v_org_id, TRIM(p_pickup_address), 'Pickup', p_pickup_note)
  RETURNING id INTO v_pickup_loc_id;

  INSERT INTO public.locations (org_id, address_text, label, note)
  VALUES (v_org_id, TRIM(p_dropoff_address), 'Dropoff', p_dropoff_note)
  RETURNING id INTO v_dropoff_loc_id;

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

      -- Snapshot product name and price; also enforces that the product
      -- belongs to the caller's org.
      SELECT name, price
        INTO v_product_name, v_product_price
        FROM public.products
       WHERE id = v_product_id
         AND org_id = v_org_id;

      IF v_product_name IS NULL THEN
        RAISE EXCEPTION 'Product % not found in caller''s organisation.', v_product_id;
      END IF;

      INSERT INTO public.task_items (
        task_id,
        product_id,
        product_name,
        unit_price,
        quantity,
        total_price
      ) VALUES (
        v_task.id,
        v_product_id,
        v_product_name,
        v_product_price,
        v_qty,
        v_product_price * v_qty
      );
    END LOOP;
  END IF;

  RETURN row_to_json(v_task)::JSONB;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_delivery_task(
  TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
