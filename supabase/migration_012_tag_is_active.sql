-- Add is_active field to tags
ALTER TABLE tags ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
