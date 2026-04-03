-- Migration 008: Payment Types (Tipi di Pagamento)
-- Fase 4 del gestionale centro medico

-- 1. Tabella principale
CREATE TABLE payment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Il codice è univoco all'interno della organization
  CONSTRAINT unique_payment_type_code_per_org UNIQUE (organization_id, code)
);

-- 2. Indice per organization_id
CREATE INDEX idx_payment_types_organization ON payment_types(organization_id);

-- 3. Trigger per aggiornamento automatico di updated_at
CREATE OR REPLACE FUNCTION update_payment_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_payment_types_updated_at
  BEFORE UPDATE ON payment_types
  FOR EACH ROW EXECUTE FUNCTION update_payment_types_updated_at();

-- 4. Trigger per seed automatico alla creazione di ogni organization
CREATE OR REPLACE FUNCTION seed_payment_types_for_org()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO payment_types (organization_id, name, code, is_system) VALUES
    (NEW.id, 'Contanti', 'cash', true),
    (NEW.id, 'Bonifico Bancario', 'bank_transfer', true),
    (NEW.id, 'Carta di Credito', 'credit_card', true),
    (NEW.id, 'Carta di Debito', 'debit_card', true),
    (NEW.id, 'POS', 'pos', true),
    (NEW.id, 'Assegno', 'check', true),
    (NEW.id, 'Pagamento Online', 'online_payment', true),
    (NEW.id, 'Addebito Diretto (RID/SDD)', 'direct_debit', true),
    (NEW.id, 'Altro', 'other', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_seed_payment_types
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION seed_payment_types_for_org();

-- 5. Row Level Security
ALTER TABLE payment_types ENABLE ROW LEVEL SECURITY;

-- Tutti gli utenti autenticati della organization possono leggere
CREATE POLICY "payment_types_read" ON payment_types
  FOR SELECT
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Solo accountant può inserire, modificare, eliminare
CREATE POLICY "payment_types_write" ON payment_types
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
