-- ================================================================
-- Migration 005: Add 'draft' value to task_status enum
--
-- Must be in its own migration because PostgreSQL does not allow
-- using a newly added enum value within the same transaction.
-- ================================================================

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'created';
