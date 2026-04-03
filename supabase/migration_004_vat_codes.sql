-- Migration 004: VAT Codes (Codici IVA) table
-- Italian VAT codes for organization-level tax management

CREATE TABLE vat_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text NOT NULL,
  rate numeric(5,2) NOT NULL DEFAULT 0,
  nature text,  -- Natura operazione (N1..N7) for zero-rate codes
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX idx_vat_codes_organization ON vat_codes(organization_id);

-- Auto-update updated_at trigger
CREATE TRIGGER trigger_vat_codes_updated_at
  BEFORE UPDATE ON vat_codes
  FOR EACH ROW EXECUTE FUNCTION update_subjects_updated_at();

-- Row Level Security
ALTER TABLE vat_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vat_codes_org_isolation" ON vat_codes
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));
