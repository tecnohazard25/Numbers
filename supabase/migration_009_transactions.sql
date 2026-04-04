-- Migration 009: Transactions (Movimenti)
-- Fase 5 del gestionale centro medico
-- NOTE: Il bucket Supabase Storage "transaction-attachments" deve essere creato manualmente:
--   - Bucket privato
--   - Allowed mime types: application/pdf, image/jpeg, image/png, image/webp
--   - Max file size: 10MB

-- 1. Enum per direzione movimento
CREATE TYPE transaction_direction AS ENUM ('in', 'out');

-- 2. Tabella movimenti
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  collection_resource_id uuid NOT NULL REFERENCES collection_resources(id),
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  direction transaction_direction NOT NULL,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  transaction_date date NOT NULL,
  value_date date,
  description text NOT NULL,
  reference text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Tabella allegati movimenti
CREATE TABLE transaction_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer NOT NULL,
  mime_type text NOT NULL,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Indici
CREATE INDEX idx_transactions_organization ON transactions(organization_id);
CREATE INDEX idx_transactions_collection_resource ON transactions(collection_resource_id);
CREATE INDEX idx_transactions_transaction_date ON transactions(transaction_date);
CREATE INDEX idx_transaction_attachments_transaction ON transaction_attachments(transaction_id);

-- 5. Trigger per aggiornamento automatico di updated_at
CREATE OR REPLACE FUNCTION update_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_transactions_updated_at();

-- 6. Row Level Security — transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Tutti gli utenti autenticati della organization possono leggere
CREATE POLICY "transactions_read" ON transactions
  FOR SELECT
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Solo accountant può inserire, modificare, eliminare
CREATE POLICY "transactions_write" ON transactions
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

-- 7. Row Level Security — transaction_attachments
ALTER TABLE transaction_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transaction_attachments_read" ON transaction_attachments
  FOR SELECT
  USING (transaction_id IN (
    SELECT id FROM transactions WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "transaction_attachments_write" ON transaction_attachments
  FOR ALL
  USING (
    transaction_id IN (
      SELECT id FROM transactions WHERE organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'accountant'
    )
  );
