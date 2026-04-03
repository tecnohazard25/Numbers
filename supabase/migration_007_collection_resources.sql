-- Migration 007: Collection Resources (Risorse di Incasso)
-- Fase 3 del gestionale centro medico

-- 1. Enum per tipo risorsa di incasso
CREATE TYPE collection_resource_type AS ENUM (
  'bank_account',
  'online_platform',
  'cash',
  'other'
);

-- 2. Tabella principale
CREATE TABLE collection_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  type collection_resource_type NOT NULL,
  iban text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Il codice è univoco all'interno della organization
  CONSTRAINT unique_code_per_org UNIQUE (organization_id, code),

  -- L'IBAN è obbligatorio per i conti correnti bancari
  CONSTRAINT check_iban_required CHECK (
    type != 'bank_account' OR iban IS NOT NULL
  )
);

-- 3. Indice per organization_id
CREATE INDEX idx_collection_resources_organization ON collection_resources(organization_id);

-- 4. Trigger per aggiornamento automatico di updated_at
CREATE OR REPLACE FUNCTION update_collection_resources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_collection_resources_updated_at
  BEFORE UPDATE ON collection_resources
  FOR EACH ROW EXECUTE FUNCTION update_collection_resources_updated_at();

-- 5. Row Level Security
ALTER TABLE collection_resources ENABLE ROW LEVEL SECURITY;

-- Tutti gli utenti autenticati della organization possono leggere
CREATE POLICY "collection_resources_read" ON collection_resources
  FOR SELECT
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Solo accountant può inserire, modificare, eliminare
CREATE POLICY "collection_resources_write" ON collection_resources
  FOR ALL
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'accountant'
    )
  );
