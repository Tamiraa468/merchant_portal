-- NOTE: This migration file is for reference only.
-- Your actual database already has these tables with a different schema.
-- The actual schema uses:
--   - delivery_tasks.pickup_note and dropoff_note (not on locations table)
--   - task_status ENUM type
--   - package_value field
--   - Various triggers for status transitions

-- Create locations table (if not exists)
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create task_status enum (if not exists)
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('created', 'published', 'assigned', 'picked_up', 'delivered', 'canceled', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create delivery_tasks table (if not exists)
-- Note: Your actual table has triggers - see your DB for full schema
CREATE TABLE IF NOT EXISTS delivery_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status task_status NOT NULL DEFAULT 'created',
  pickup_location_id UUID NOT NULL REFERENCES locations(id),
  dropoff_location_id UUID NOT NULL REFERENCES locations(id),
  pickup_note TEXT,
  dropoff_note TEXT,
  receiver_name TEXT,
  receiver_phone TEXT,
  package_value NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);

-- Create task_items table
CREATE TABLE IF NOT EXISTS task_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES delivery_tasks(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  total_price NUMERIC(10,2) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_delivery_tasks_org_id ON delivery_tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_delivery_tasks_status ON delivery_tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_items_task_id ON task_items(task_id);

-- Enable RLS
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies (simplified)
CREATE POLICY "Anyone can insert locations" ON locations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view locations" ON locations FOR SELECT USING (true);

CREATE POLICY "Org users can view their tasks" ON delivery_tasks FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can create tasks" ON delivery_tasks FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can update tasks" ON delivery_tasks FOR UPDATE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "View task items" ON task_items FOR SELECT
  USING (task_id IN (SELECT id FROM delivery_tasks WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "Create task items" ON task_items FOR INSERT
  WITH CHECK (task_id IN (SELECT id FROM delivery_tasks WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())));
