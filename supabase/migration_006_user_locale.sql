-- Migration 006: Move regional settings from organizations to profiles
-- Currency stays on organizations; locale/format/separators move to profiles

-- 1. Add locale columns to profiles
ALTER TABLE profiles
  ADD COLUMN locale text NOT NULL DEFAULT 'it-IT',
  ADD COLUMN date_format text NOT NULL DEFAULT 'dd/MM/yyyy',
  ADD COLUMN time_format text NOT NULL DEFAULT 'HH:mm',
  ADD COLUMN decimal_separator text NOT NULL DEFAULT ',',
  ADD COLUMN thousands_separator text NOT NULL DEFAULT '.';

-- 2. Copy existing org settings to profiles (one-time data migration)
UPDATE profiles p
SET
  locale = o.locale,
  date_format = o.date_format,
  time_format = o.time_format,
  decimal_separator = o.decimal_separator,
  thousands_separator = o.thousands_separator
FROM organizations o
WHERE p.organization_id = o.id;

-- 3. Remove locale columns from organizations (currency stays)
ALTER TABLE organizations
  DROP COLUMN locale,
  DROP COLUMN date_format,
  DROP COLUMN time_format,
  DROP COLUMN decimal_separator,
  DROP COLUMN thousands_separator;
