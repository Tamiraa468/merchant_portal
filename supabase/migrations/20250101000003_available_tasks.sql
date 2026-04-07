-- ================================================
-- Migration 003: Add courier_id to delivery_tasks
-- Prerequisite for delivery publishing system (005)
-- ================================================

-- Add courier_id column for courier assignment
ALTER TABLE delivery_tasks
  ADD COLUMN IF NOT EXISTS courier_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_tasks_courier_id ON delivery_tasks(courier_id);
