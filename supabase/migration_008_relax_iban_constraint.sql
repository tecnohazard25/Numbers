-- Migration 008: Relax IBAN constraint on collection_resources
-- Allow bank_account type without IBAN (e.g. during seed/initial setup)
-- IBAN validation is handled at the application level when needed

ALTER TABLE collection_resources DROP CONSTRAINT check_iban_required;
