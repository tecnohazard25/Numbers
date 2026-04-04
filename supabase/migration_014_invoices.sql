-- Migration 014: Electronic Invoices (Fatture Elettroniche)
-- Fase 9 del gestionale centro medico

-- 0. Aggiunta CF/P.IVA alla organization
ALTER TABLE organizations
  ADD COLUMN fiscal_code text,
  ADD COLUMN vat_number text;

-- 1. Enum types
CREATE TYPE invoice_direction AS ENUM ('issued', 'received');
CREATE TYPE invoice_document_type AS ENUM ('invoice', 'credit_note', 'debit_note');
CREATE TYPE reconciliation_status AS ENUM ('unmatched', 'suggested', 'confirmed', 'excluded');
CREATE TYPE subject_reconciliation_status AS ENUM ('unmatched', 'confirmed', 'created');

-- 2. SDI Accounts
CREATE TABLE sdi_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  pec text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_sdi_code_per_org UNIQUE (organization_id, code)
);

CREATE INDEX idx_sdi_accounts_organization ON sdi_accounts(organization_id);

-- 3. Invoices
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sdi_account_id uuid NOT NULL REFERENCES sdi_accounts(id),
  direction invoice_direction NOT NULL,
  document_type invoice_document_type NOT NULL DEFAULT 'invoice',

  -- Dati SDI
  sdi_id text,
  sdi_status text,

  -- Dati documento
  number text NOT NULL,
  date date NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',

  -- Totali
  total_taxable numeric(15,2) NOT NULL DEFAULT 0,
  total_vat numeric(15,2) NOT NULL DEFAULT 0,
  total_amount numeric(15,2) NOT NULL DEFAULT 0,

  -- Controparte
  counterpart_name text NOT NULL,
  counterpart_fiscal_code text,
  counterpart_vat text,
  counterpart_address text,

  -- Pagamento (da XML)
  payment_method text,

  -- Anagrafica riconciliata (SQL puro, no AI)
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  subject_reconciliation_status subject_reconciliation_status NOT NULL DEFAULT 'unmatched',

  -- XML inline (no storage bucket)
  xml_content text NOT NULL,
  xml_hash text NOT NULL,

  -- Metadati
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_xml_hash_per_org UNIQUE (organization_id, xml_hash)
);

CREATE INDEX idx_invoices_organization ON invoices(organization_id);
CREATE INDEX idx_invoices_sdi_account ON invoices(sdi_account_id);
CREATE INDEX idx_invoices_direction ON invoices(organization_id, direction);
CREATE INDEX idx_invoices_date ON invoices(organization_id, date);
CREATE INDEX idx_invoices_subject ON invoices(subject_id);

-- 4. Invoice Lines
CREATE TABLE invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  description text,
  quantity numeric(10,4),
  unit_price numeric(15,4),
  total_price numeric(15,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2),
  vat_nature text,

  -- Riconciliazione activity (solo fatture emesse) — Gemini
  suggested_activity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  confirmed_activity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  activity_reconciliation_status reconciliation_status NOT NULL DEFAULT 'unmatched'
);

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

-- 5. Invoice Payment Schedule (scadenzario)
CREATE TABLE invoice_payment_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  amount numeric(15,2) NOT NULL,
  paid_date date,
  paid_amount numeric(15,2),

  -- Riconciliazione con movimento — Gemini suggerisce, utente conferma
  suggested_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  confirmed_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  transaction_reconciliation_status reconciliation_status NOT NULL DEFAULT 'unmatched'
);

CREATE INDEX idx_invoice_payment_schedule_invoice ON invoice_payment_schedule(invoice_id);

-- 6. Triggers per aggiornamento automatico di updated_at
CREATE OR REPLACE FUNCTION update_sdi_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sdi_accounts_updated_at
  BEFORE UPDATE ON sdi_accounts
  FOR EACH ROW EXECUTE FUNCTION update_sdi_accounts_updated_at();

CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_invoices_updated_at();

-- 7. Row Level Security — sdi_accounts
ALTER TABLE sdi_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sdi_accounts_read" ON sdi_accounts
  FOR SELECT
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "sdi_accounts_write" ON sdi_accounts
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

-- 8. Row Level Security — invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_read" ON invoices
  FOR SELECT
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "invoices_write" ON invoices
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

-- 9. Row Level Security — invoice_lines
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_lines_read" ON invoice_lines
  FOR SELECT
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "invoice_lines_write" ON invoice_lines
  FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'accountant'
    )
  );

-- 10. Row Level Security — invoice_payment_schedule
ALTER TABLE invoice_payment_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_read" ON invoice_payment_schedule
  FOR SELECT
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "schedule_write" ON invoice_payment_schedule
  FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'accountant'
    )
  );
