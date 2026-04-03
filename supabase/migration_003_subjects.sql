-- Migration 003: Subjects (Anagrafica) tables
-- Phase 2 of the medical center management system

-- 1. Enums
CREATE TYPE subject_type AS ENUM (
  'person',
  'company',
  'sole_trader',
  'public_administration'
);

CREATE TYPE contact_type AS ENUM ('phone', 'mobile', 'email', 'pec');

-- 2. Subjects (main entity)
CREATE TABLE subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type subject_type NOT NULL,

  -- Person fields (type = 'person')
  first_name text,
  last_name text,
  birth_date date,
  birth_place text,
  gender char(1), -- 'M' or 'F'

  -- Company/sole_trader/public_administration fields
  business_name text,

  -- Common fields
  tax_code text,
  vat_number text,
  sdi_code text,
  iban text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Integrity constraints
  CONSTRAINT check_person_fields CHECK (
    type != 'person' OR (first_name IS NOT NULL AND last_name IS NOT NULL)
  ),
  CONSTRAINT check_company_fields CHECK (
    type = 'person' OR business_name IS NOT NULL
  )
);

CREATE INDEX idx_subjects_organization ON subjects(organization_id);
CREATE INDEX idx_subjects_organization_type ON subjects(organization_id, type);

-- 3. Subject Addresses
CREATE TABLE subject_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  country_code char(2) NOT NULL DEFAULT 'IT',
  street text,
  zip_code text,
  city text,
  province text,
  region text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subject_addresses_subject ON subject_addresses(subject_id);

-- 4. Subject Contacts
CREATE TABLE subject_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  type contact_type NOT NULL,
  label text,
  value text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subject_contacts_subject ON subject_contacts(subject_id);

-- 5. Tags (organization-scoped)
CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  UNIQUE (organization_id, name)
);

CREATE INDEX idx_tags_organization ON tags(organization_id);

-- 6. Subject Tags (junction)
CREATE TABLE subject_tags (
  subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (subject_id, tag_id)
);

-- 7. Auto-update updated_at trigger for subjects
CREATE OR REPLACE FUNCTION update_subjects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_subjects_updated_at
  BEFORE UPDATE ON subjects
  FOR EACH ROW EXECUTE FUNCTION update_subjects_updated_at();

-- 8. Row Level Security

-- subjects
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subjects_org_isolation" ON subjects
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- subject_addresses
ALTER TABLE subject_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subject_addresses_org_isolation" ON subject_addresses
  USING (subject_id IN (
    SELECT id FROM subjects WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  ));

-- subject_contacts
ALTER TABLE subject_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subject_contacts_org_isolation" ON subject_contacts
  USING (subject_id IN (
    SELECT id FROM subjects WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  ));

-- tags
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_org_isolation" ON tags
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- subject_tags
ALTER TABLE subject_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subject_tags_org_isolation" ON subject_tags
  USING (tag_id IN (
    SELECT id FROM tags WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  ));
