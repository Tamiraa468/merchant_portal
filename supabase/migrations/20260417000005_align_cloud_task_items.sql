-- ================================================================
-- Migration: align cloud's task_items schema with local
--
-- Cloud has a drifted schema:
--   id, created_at, task_id, product_id, qty, note
-- Canonical schema (from 20250101000002 on local) is:
--   id, task_id, product_id, product_name, unit_price, quantity,
--   total_price
--
-- The drift exists only on cloud (local has the canonical schema),
-- so this migration is conditional: it fires only when the legacy
-- `qty` column is present, making it a safe no-op on any DB that
-- already matches canonical (local, or a freshly reset local DB).
--
-- Safe because cloud's task_items is empty (verified 0 rows).
-- ================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'task_items'
       AND column_name  = 'qty'
  ) THEN
    DROP TABLE public.task_items CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.task_items (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID          NOT NULL REFERENCES public.delivery_tasks(id) ON DELETE CASCADE,
  product_id   UUID          NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT          NOT NULL,
  unit_price   NUMERIC(10,2) NOT NULL,
  quantity     INTEGER       NOT NULL CHECK (quantity > 0),
  total_price  NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_items_task_id
  ON public.task_items(task_id);

ALTER TABLE public.task_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View task items" ON public.task_items;
CREATE POLICY "View task items"
  ON public.task_items FOR SELECT
  USING (
    task_id IN (
      SELECT id FROM public.delivery_tasks
       WHERE org_id IN (
         SELECT org_id FROM public.profiles WHERE id = auth.uid()
       )
    )
  );

DROP POLICY IF EXISTS "Create task items" ON public.task_items;
CREATE POLICY "Create task items"
  ON public.task_items FOR INSERT
  WITH CHECK (
    task_id IN (
      SELECT id FROM public.delivery_tasks
       WHERE org_id IN (
         SELECT org_id FROM public.profiles WHERE id = auth.uid()
       )
    )
  );

GRANT SELECT, INSERT ON public.task_items TO authenticated;
GRANT ALL ON public.task_items TO service_role;

COMMIT;
