-- Migration 009: Remove is_system column from payment_types
-- All payment types are now treated equally (no system vs custom distinction)

ALTER TABLE payment_types DROP COLUMN IF EXISTS is_system;
