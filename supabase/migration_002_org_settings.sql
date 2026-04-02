-- ============================================
-- Migration 002: Organization locale settings
-- ============================================

ALTER TABLE organizations
  ADD COLUMN locale text NOT NULL DEFAULT 'it-IT',
  ADD COLUMN currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN date_format text NOT NULL DEFAULT 'dd/MM/yyyy',
  ADD COLUMN time_format text NOT NULL DEFAULT 'HH:mm',
  ADD COLUMN decimal_separator text NOT NULL DEFAULT ',',
  ADD COLUMN thousands_separator text NOT NULL DEFAULT '.';
