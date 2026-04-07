-- ================================================================
-- Migration 004: Customer → Merchant Orders System
-- Full orders, order_items, payments with strict payment verification
-- Production-grade — paste into Supabase SQL Editor as-is.
-- ================================================================

BEGIN;

-- ============================================================
-- 1) ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pending_payment',
    'paid',
    'preparing',
    'ready_for_delivery',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'pending',
    'paid',
    'failed',
    'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2) HELPER FUNCTIONS
-- ============================================================

-- current_org_id(): returns the org_id of the authenticated user.
-- SECURITY DEFINER so RLS policies can call it without granting
-- direct SELECT on profiles to every role.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Reusable: set updated_at on any table
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 3) ORDERS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Snapshot fields (copied at creation time — never join for display)
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,

  -- Status & currency
  status    order_status NOT NULL DEFAULT 'pending_payment',
  currency  TEXT         NOT NULL DEFAULT 'MNT',

  -- Money
  subtotal      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  delivery_fee  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),

  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Merchant dashboard: filter by org + status, newest first
CREATE INDEX IF NOT EXISTS idx_orders_org_status_created
  ON public.orders (org_id, status, created_at DESC);

-- Customer order history
CREATE INDEX IF NOT EXISTS idx_orders_customer_created
  ON public.orders (customer_id, created_at DESC);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4) ORDER STATUS TRANSITION ENFORCEMENT
--
--    This trigger runs BEFORE UPDATE on orders.status.
--    It enforces the full state machine:
--
--      pending_payment ──(payment trigger ONLY)──▶ paid
--      paid ──▶ preparing
--      preparing ──▶ ready_for_delivery
--      cancelled is reachable from pending_payment / paid / preparing
--      ready_for_delivery and cancelled are terminal.
--
--    The pending_payment → paid path is gated by a session
--    variable (app.payment_trigger_active) that ONLY the
--    payment confirmation trigger sets. Any direct UPDATE
--    from client code will be rejected.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- No-op if status unchanged
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- ── pending_payment → paid: ONLY via payment trigger ──
  IF OLD.status = 'pending_payment' AND NEW.status = 'paid' THEN
    IF current_setting('app.payment_trigger_active', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION
        'Order status cannot be set to "paid" manually. '
        'Payment must be confirmed through the payments table.';
    END IF;
    RETURN NEW;
  END IF;

  -- ── paid → preparing (merchant action) ──
  IF OLD.status = 'paid' AND NEW.status = 'preparing' THEN
    RETURN NEW;
  END IF;

  -- ── preparing → ready_for_delivery ──
  IF OLD.status = 'preparing' AND NEW.status = 'ready_for_delivery' THEN
    RETURN NEW;
  END IF;

  -- ── cancellation from non-terminal states ──
  IF NEW.status = 'cancelled'
     AND OLD.status IN ('pending_payment', 'paid', 'preparing') THEN
    RETURN NEW;
  END IF;

  -- Everything else is illegal
  RAISE EXCEPTION 'Invalid order status transition: % → %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_status ON public.orders;
CREATE TRIGGER trg_enforce_order_status
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_status_transition();

-- ============================================================
-- 5) ORDER ITEMS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  unit_price   NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  qty          INTEGER       NOT NULL CHECK (qty > 0),
  line_total   NUMERIC(12,2) GENERATED ALWAYS AS (unit_price * qty) STORED,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

-- ============================================================
-- 6) RECALCULATE ORDER TOTALS ON ITEM CHANGE
--    Fires AFTER INSERT / UPDATE / DELETE on order_items.
--    Also recalculates when delivery_fee changes on orders.
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalc_order_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_order_id UUID;
  new_subtotal    NUMERIC(12,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_order_id := OLD.order_id;
  ELSE
    target_order_id := NEW.order_id;
  END IF;

  SELECT COALESCE(SUM(unit_price * qty), 0)
    INTO new_subtotal
    FROM public.order_items
   WHERE order_id = target_order_id;

  UPDATE public.orders
     SET subtotal     = new_subtotal,
         total_amount = new_subtotal + delivery_fee
   WHERE id = target_order_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_recalc_insert ON public.order_items;
CREATE TRIGGER trg_order_items_recalc_insert
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_totals();

DROP TRIGGER IF EXISTS trg_order_items_recalc_update ON public.order_items;
CREATE TRIGGER trg_order_items_recalc_update
  AFTER UPDATE OF unit_price, qty ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_totals();

DROP TRIGGER IF EXISTS trg_order_items_recalc_delete ON public.order_items;
CREATE TRIGGER trg_order_items_recalc_delete
  AFTER DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_totals();

-- Recalculate total_amount when delivery_fee is updated directly
CREATE OR REPLACE FUNCTION public.recalc_on_delivery_fee_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.delivery_fee IS DISTINCT FROM NEW.delivery_fee THEN
    NEW.total_amount := NEW.subtotal + COALESCE(NEW.delivery_fee, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_fee_change ON public.orders;
CREATE TRIGGER trg_delivery_fee_change
  BEFORE UPDATE OF delivery_fee ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.recalc_on_delivery_fee_change();

-- ============================================================
-- 7) PAYMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL CHECK (provider IN ('qpay', 'stripe', 'bank', 'cash')),
  provider_ref TEXT,
  status       payment_status NOT NULL DEFAULT 'pending',
  amount       NUMERIC(12,2)  NOT NULL CHECK (amount >= 0),
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Dashboard queries: filter by status, newest first
CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON public.payments (status, created_at DESC);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 8) PAYMENT CONFIRMATION TRIGGER  ★ CRITICAL ★
--
--    This is the ONLY path that can move an order to "paid".
--    Runs as SECURITY DEFINER so it can write to orders even
--    when called from service_role via a webhook.
--
--    Handles two scenarios:
--      a) UPDATE: payment row transitions from pending → paid
--      b) INSERT: cash payment inserted directly as 'paid'
--
--    Also handles refund → auto-cancel.
-- ============================================================

CREATE OR REPLACE FUNCTION public.on_payment_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── Transition to 'paid' ──
  IF NEW.status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN

    -- Stamp paid_at
    NEW.paid_at := NOW();

    -- Set session flag so order trigger allows pending_payment → paid
    PERFORM set_config('app.payment_trigger_active', 'true', true);

    UPDATE public.orders
       SET status = 'paid'
     WHERE id = NEW.order_id
       AND status = 'pending_payment';

    -- Clear flag immediately (transaction-scoped, but be explicit)
    PERFORM set_config('app.payment_trigger_active', 'false', true);
  END IF;

  -- ── Refund → auto-cancel ──
  IF NEW.status = 'refunded'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'refunded') THEN
    UPDATE public.orders
       SET status = 'cancelled'
     WHERE id = NEW.order_id
       AND status NOT IN ('cancelled', 'ready_for_delivery');
  END IF;

  RETURN NEW;
END;
$$;

-- Fires on UPDATE of status column
DROP TRIGGER IF EXISTS trg_payment_confirmed ON public.payments;
CREATE TRIGGER trg_payment_confirmed
  BEFORE UPDATE OF status ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.on_payment_confirmed();

-- Fires on INSERT when status is already 'paid' (e.g., cash payments)
DROP TRIGGER IF EXISTS trg_payment_confirmed_on_insert ON public.payments;
CREATE TRIGGER trg_payment_confirmed_on_insert
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION public.on_payment_confirmed();

-- ============================================================
-- 9) ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 10) RLS POLICIES — ORDERS
-- ============================================================

-- Merchant/staff: see orders belonging to their org
DROP POLICY IF EXISTS "orders_select_merchant" ON public.orders;
CREATE POLICY "orders_select_merchant"
  ON public.orders FOR SELECT
  USING (org_id = public.current_org_id());

-- Customer: see their own orders
DROP POLICY IF EXISTS "orders_select_customer" ON public.orders;
CREATE POLICY "orders_select_customer"
  ON public.orders FOR SELECT
  USING (customer_id = auth.uid());

-- Customer: create a new order (status must start as pending_payment)
DROP POLICY IF EXISTS "orders_insert_customer" ON public.orders;
CREATE POLICY "orders_insert_customer"
  ON public.orders FOR INSERT
  WITH CHECK (
    customer_id = auth.uid()
    AND status = 'pending_payment'
  );

-- Merchant: create orders on behalf of customers (POS / phone orders)
DROP POLICY IF EXISTS "orders_insert_merchant" ON public.orders;
CREATE POLICY "orders_insert_merchant"
  ON public.orders FOR INSERT
  WITH CHECK (org_id = public.current_org_id());

-- Merchant: update orders within own org (status transitions, notes, etc.)
DROP POLICY IF EXISTS "orders_update_merchant" ON public.orders;
CREATE POLICY "orders_update_merchant"
  ON public.orders FOR UPDATE
  USING  (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

-- ============================================================
-- 11) RLS POLICIES — ORDER ITEMS
-- ============================================================

-- SELECT: anyone who can see the parent order can see its items
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select"
  ON public.order_items FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders
       WHERE org_id = public.current_org_id()
          OR customer_id = auth.uid()
    )
  );

-- INSERT: merchant of that org
DROP POLICY IF EXISTS "order_items_insert_merchant" ON public.order_items;
CREATE POLICY "order_items_insert_merchant"
  ON public.order_items FOR INSERT
  WITH CHECK (
    order_id IN (
      SELECT id FROM public.orders WHERE org_id = public.current_org_id()
    )
  );

-- INSERT: customer can add items to their own pending order
DROP POLICY IF EXISTS "order_items_insert_customer" ON public.order_items;
CREATE POLICY "order_items_insert_customer"
  ON public.order_items FOR INSERT
  WITH CHECK (
    order_id IN (
      SELECT id FROM public.orders
       WHERE customer_id = auth.uid()
         AND status = 'pending_payment'
    )
  );

-- UPDATE: merchant only
DROP POLICY IF EXISTS "order_items_update_merchant" ON public.order_items;
CREATE POLICY "order_items_update_merchant"
  ON public.order_items FOR UPDATE
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE org_id = public.current_org_id()
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM public.orders WHERE org_id = public.current_org_id()
    )
  );

-- DELETE: merchant only
DROP POLICY IF EXISTS "order_items_delete_merchant" ON public.order_items;
CREATE POLICY "order_items_delete_merchant"
  ON public.order_items FOR DELETE
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE org_id = public.current_org_id()
    )
  );

-- ============================================================
-- 12) RLS POLICIES — PAYMENTS
--
--     ★ NO INSERT / UPDATE policies for authenticated users. ★
--     All writes go through service_role (bypasses RLS) from:
--       - Payment gateway webhooks (qpay, stripe)
--       - Supabase Edge Functions
--       - Server-side admin actions
-- ============================================================

-- Merchant: read payments for their org's orders
DROP POLICY IF EXISTS "payments_select_merchant" ON public.payments;
CREATE POLICY "payments_select_merchant"
  ON public.payments FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE org_id = public.current_org_id()
    )
  );

-- Customer: read payment for their own order
DROP POLICY IF EXISTS "payments_select_customer" ON public.payments;
CREATE POLICY "payments_select_customer"
  ON public.payments FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE customer_id = auth.uid()
    )
  );

-- ============================================================
-- 13) TABLE GRANTS
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE    ON public.orders      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT SELECT                    ON public.payments     TO authenticated;

GRANT ALL ON public.orders      TO service_role;
GRANT ALL ON public.order_items TO service_role;
GRANT ALL ON public.payments    TO service_role;

-- ============================================================
-- 14) ADDITIONAL PERFORMANCE INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_provider
  ON public.payments (provider, status);

COMMIT;

-- ============================================================
-- SUMMARY
-- ============================================================
--
-- Tables created:
--   orders         — merchant orders with status state machine
--   order_items    — line items with generated line_total
--   payments       — 1:1 with orders, strict provider CHECK
--
-- Enums:
--   order_status   — pending_payment → paid → preparing → ready_for_delivery | cancelled
--   payment_status — pending → paid | failed | refunded
--
-- Triggers:
--   trg_orders_updated_at              — auto-stamps updated_at
--   trg_enforce_order_status           — state machine guard (session-var gated)
--   trg_order_items_recalc_*           — subtotal & total_amount auto-calc
--   trg_delivery_fee_change            — recalc total on fee change
--   trg_payments_updated_at            — auto-stamps updated_at
--   trg_payment_confirmed              — UPDATE path: payment → order promotion
--   trg_payment_confirmed_on_insert    — INSERT path: cash payment shortcut
--
-- RLS:
--   orders       — merchant SELECT/INSERT/UPDATE by org; customer SELECT/INSERT own
--   order_items  — SELECT via parent order; INSERT/UPDATE/DELETE merchant; INSERT customer (pending only)
--   payments     — SELECT only (merchant by org, customer by uid); NO client writes
--
-- Security invariants:
--   ✓ pending_payment → paid is IMPOSSIBLE without payment trigger
--   ✓ Payments table has NO INSERT/UPDATE RLS for authenticated — service_role only
--   ✓ All SECURITY DEFINER functions use SET search_path = public
--   ✓ Status transitions are exhaustively validated
