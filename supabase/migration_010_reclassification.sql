-- Migration 010: Reclassification Templates
-- Phase 6: Bilancio Riclassificato
-- FRESH INSTALL: drop everything first, then recreate

-- ============================================
-- DROP existing objects (trigger BEFORE function to avoid dependency error)
-- ============================================
DROP TRIGGER IF EXISTS trg_clone_template_on_org_create ON organizations;
DROP TABLE IF EXISTS reclassification_node_refs CASCADE;
DROP TABLE IF EXISTS reclassification_nodes CASCADE;
DROP TABLE IF EXISTS reclassification_templates CASCADE;
DROP TYPE IF EXISTS reclassification_node_type;
DROP TYPE IF EXISTS reclassification_node_sign;
DROP FUNCTION IF EXISTS clone_system_template_for_org();
DROP FUNCTION IF EXISTS update_descendants_full_code();
DROP FUNCTION IF EXISTS compute_full_code();
DROP FUNCTION IF EXISTS update_reclassification_nodes_updated_at();
DROP FUNCTION IF EXISTS update_reclassification_templates_updated_at();

-- ============================================
-- 1. Enum types
-- ============================================
CREATE TYPE reclassification_node_sign AS ENUM ('positive', 'negative');

-- ============================================
-- 2. Templates table
-- ============================================
CREATE TABLE reclassification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_template boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_base boolean NOT NULL DEFAULT false,
  cloned_from_id uuid REFERENCES reclassification_templates(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT check_template_no_org CHECK (
    NOT is_template OR organization_id IS NULL
  )
);

CREATE INDEX idx_reclassification_templates_org ON reclassification_templates(organization_id);
-- Only one base template per organization
CREATE UNIQUE INDEX unique_base_per_org ON reclassification_templates (organization_id) WHERE is_base = true;

-- ============================================
-- 3. Nodes table
-- ============================================
CREATE TABLE reclassification_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES reclassification_templates(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES reclassification_nodes(id) ON DELETE CASCADE,
  code text NOT NULL,
  full_code text NOT NULL,
  name text NOT NULL,
  sign reclassification_node_sign NOT NULL DEFAULT 'positive',
  order_index integer NOT NULL DEFAULT 0,
  is_total boolean NOT NULL DEFAULT false,
  formula text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_code_per_parent UNIQUE (template_id, parent_id, code)
);

CREATE INDEX idx_reclassification_nodes_template ON reclassification_nodes(template_id);
CREATE INDEX idx_reclassification_nodes_parent ON reclassification_nodes(parent_id);

-- ============================================
-- 4. Node refs table (for total auto-sum)
-- ============================================
CREATE TABLE reclassification_node_refs (
  total_node_id uuid NOT NULL REFERENCES reclassification_nodes(id) ON DELETE CASCADE,
  ref_node_id uuid NOT NULL REFERENCES reclassification_nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (total_node_id, ref_node_id)
);

CREATE INDEX idx_reclassification_node_refs_total ON reclassification_node_refs(total_node_id);

-- ============================================
-- 5. updated_at triggers
-- ============================================
CREATE OR REPLACE FUNCTION update_reclassification_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reclassification_templates_updated_at
  BEFORE UPDATE ON reclassification_templates
  FOR EACH ROW EXECUTE FUNCTION update_reclassification_templates_updated_at();

CREATE OR REPLACE FUNCTION update_reclassification_nodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reclassification_nodes_updated_at
  BEFORE UPDATE ON reclassification_nodes
  FOR EACH ROW EXECUTE FUNCTION update_reclassification_nodes_updated_at();

-- ============================================
-- 6. Trigger: auto-compute full_code
-- ============================================
CREATE OR REPLACE FUNCTION compute_full_code()
RETURNS TRIGGER AS $$
DECLARE
  parent_full_code text;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.full_code := NEW.code;
  ELSE
    SELECT full_code INTO parent_full_code
    FROM reclassification_nodes
    WHERE id = NEW.parent_id;
    NEW.full_code := parent_full_code || '.' || NEW.code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_compute_full_code
BEFORE INSERT OR UPDATE OF code, parent_id
ON reclassification_nodes
FOR EACH ROW EXECUTE FUNCTION compute_full_code();

-- ============================================
-- 7. Trigger: cascade full_code to descendants
-- ============================================
CREATE OR REPLACE FUNCTION update_descendants_full_code()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.full_code != NEW.full_code THEN
    UPDATE reclassification_nodes
    SET full_code = NEW.full_code || '.' || code
    WHERE parent_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_descendants_full_code
AFTER UPDATE OF full_code
ON reclassification_nodes
FOR EACH ROW EXECUTE FUNCTION update_descendants_full_code();

-- ============================================
-- 8. Trigger: clone system template on org creation
-- ============================================
CREATE OR REPLACE FUNCTION clone_system_template_for_org()
RETURNS TRIGGER AS $$
DECLARE
  system_template_id uuid;
  new_template_id uuid;
  new_id uuid;
  id_map jsonb := '{}'::jsonb;
  node_rec RECORD;
  ref_rec RECORD;
BEGIN
  SELECT id INTO system_template_id
  FROM reclassification_templates
  WHERE is_template = true
  LIMIT 1;

  IF system_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO reclassification_templates (
    organization_id, name, description, is_template, is_base, cloned_from_id
  )
  SELECT NEW.id, name, description, false, true, system_template_id
  FROM reclassification_templates
  WHERE id = system_template_id
  RETURNING id INTO new_template_id;

  -- Clone root nodes
  FOR node_rec IN
    SELECT id, code, name, sign, order_index, is_total, formula
    FROM reclassification_nodes
    WHERE template_id = system_template_id AND parent_id IS NULL
    ORDER BY order_index
  LOOP
    INSERT INTO reclassification_nodes (
      template_id, parent_id, code, name, sign, order_index, is_total, formula
    ) VALUES (
      new_template_id, NULL, node_rec.code, node_rec.name,
      node_rec.sign, node_rec.order_index, node_rec.is_total, node_rec.formula
    ) RETURNING id INTO new_id;
    id_map := id_map || jsonb_build_object(node_rec.id::text, new_id::text);
  END LOOP;

  -- Clone child nodes level by level
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM reclassification_nodes n
      WHERE n.template_id = system_template_id
        AND n.parent_id IS NOT NULL
        AND id_map ? n.parent_id::text
        AND NOT (id_map ? n.id::text)
    );

    FOR node_rec IN
      SELECT id, parent_id, code, name, sign, order_index, is_total, formula
      FROM reclassification_nodes
      WHERE template_id = system_template_id
        AND parent_id IS NOT NULL
        AND id_map ? parent_id::text
        AND NOT (id_map ? id::text)
      ORDER BY order_index
    LOOP
      INSERT INTO reclassification_nodes (
        template_id, parent_id, code, name, sign, order_index, is_total, formula
      ) VALUES (
        new_template_id,
        (id_map ->> node_rec.parent_id::text)::uuid,
        node_rec.code, node_rec.name,
        node_rec.sign, node_rec.order_index, node_rec.is_total, node_rec.formula
      ) RETURNING id INTO new_id;
      id_map := id_map || jsonb_build_object(node_rec.id::text, new_id::text);
    END LOOP;
  END LOOP;

  -- Clone node refs using id_map
  FOR ref_rec IN
    SELECT total_node_id, ref_node_id
    FROM reclassification_node_refs
    WHERE total_node_id IN (
      SELECT id FROM reclassification_nodes WHERE template_id = system_template_id
    )
  LOOP
    IF (id_map ? ref_rec.total_node_id::text) AND (id_map ? ref_rec.ref_node_id::text) THEN
      INSERT INTO reclassification_node_refs (total_node_id, ref_node_id)
      VALUES (
        (id_map ->> ref_rec.total_node_id::text)::uuid,
        (id_map ->> ref_rec.ref_node_id::text)::uuid
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clone_template_on_org_create
AFTER INSERT ON organizations
FOR EACH ROW EXECUTE FUNCTION clone_system_template_for_org();

-- ============================================
-- 9. Row Level Security
-- ============================================
ALTER TABLE reclassification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_read" ON reclassification_templates
  FOR SELECT USING (
    is_template = true
    OR organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "templates_write" ON reclassification_templates
  FOR ALL USING (
    is_template = false
    AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'accountant'
    )
  );

ALTER TABLE reclassification_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nodes_read" ON reclassification_nodes
  FOR SELECT USING (
    template_id IN (
      SELECT id FROM reclassification_templates
      WHERE is_template = true
      OR organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "nodes_write" ON reclassification_nodes
  FOR ALL USING (
    template_id IN (
      SELECT id FROM reclassification_templates
      WHERE is_template = false
      AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'accountant'
    )
  );

ALTER TABLE reclassification_node_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refs_read" ON reclassification_node_refs
  FOR SELECT USING (
    total_node_id IN (
      SELECT n.id FROM reclassification_nodes n
      JOIN reclassification_templates t ON t.id = n.template_id
      WHERE t.is_template = true
      OR t.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "refs_write" ON reclassification_node_refs
  FOR ALL USING (
    total_node_id IN (
      SELECT n.id FROM reclassification_nodes n
      JOIN reclassification_templates t ON t.id = n.template_id
      WHERE t.is_template = false
      AND t.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'accountant'
    )
  );

-- ============================================
-- 10. Seed: system template for poliambulatorio
-- ============================================
DO $$
DECLARE
  tmpl_id uuid;
  id_a uuid; id_b uuid; id_t1 uuid;
  id_c uuid; id_d uuid; id_e uuid; id_f uuid; id_t2 uuid;
  id_g uuid; id_t3 uuid;
  id_h uuid; id_t4 uuid;
  id_i uuid; id_t5 uuid;
  id_a1 uuid; id_a2 uuid; id_a3 uuid;
  id_b1 uuid; id_b2 uuid; id_b3 uuid;
  id_c1 uuid; id_c2 uuid; id_c3 uuid;
  id_d1 uuid; id_d2 uuid; id_d3 uuid;
  id_e1 uuid; id_e2 uuid; id_e3 uuid; id_e4 uuid; id_e5 uuid; id_e6 uuid; id_e7 uuid;
  id_f1 uuid; id_f2 uuid; id_f3 uuid;
  id_g1 uuid; id_g2 uuid; id_g3 uuid; id_g4 uuid;
  id_h1 uuid; id_h2 uuid; id_h3 uuid;
  id_i1 uuid; id_i2 uuid; id_i3 uuid;
BEGIN
  INSERT INTO reclassification_templates (name, description, is_template, is_active, is_base)
  VALUES ('Riclassificato standard', 'Schema di riclassificazione predefinito per centri medici e poliambulatori', true, true, true)
  RETURNING id INTO tmpl_id;

  -- ── A: Ricavi delle Prestazioni Sanitarie ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, NULL, 'A', 'Ricavi delle Prestazioni Sanitarie', 'positive', 0) RETURNING id INTO id_a;

  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_a, '1', 'Prestazioni SSN', 'positive', 0) RETURNING id INTO id_a1;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_a, '2', 'Prestazioni Fondi e Assicurazioni', 'positive', 1) RETURNING id INTO id_a2;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_a, '3', 'Prestazioni Private', 'positive', 2) RETURNING id INTO id_a3;

  -- ── B: Altri Ricavi ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, NULL, 'B', 'Altri Ricavi', 'positive', 1) RETURNING id INTO id_b;

  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_b, '1', 'Vendita Presidi e Dispositivi', 'positive', 0) RETURNING id INTO id_b1;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_b, '2', 'Contributi e Sovvenzioni', 'positive', 1) RETURNING id INTO id_b2;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_b, '3', 'Altri Proventi', 'positive', 2) RETURNING id INTO id_b3;

  -- ── T1: Valore della Produzione (totale) ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index, is_total)
  VALUES (tmpl_id, NULL, 'T1', 'Valore della Produzione', 'positive', 2, true) RETURNING id INTO id_t1;

  -- ── C: Costi del Personale ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, NULL, 'C', 'Costi del Personale', 'negative', 3) RETURNING id INTO id_c;

  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_c, '1', 'Medici e Sanitari Dipendenti', 'negative', 0) RETURNING id INTO id_c1;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_c, '2', 'Personale Amministrativo', 'negative', 1) RETURNING id INTO id_c2;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_c, '3', 'Collaboratori e Consulenti', 'negative', 2) RETURNING id INTO id_c3;

  -- ── D: Consumi e Materiali ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, NULL, 'D', 'Consumi e Materiali', 'negative', 4) RETURNING id INTO id_d;

  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_d, '1', 'Materiale Sanitario e Farmaci', 'negative', 0) RETURNING id INTO id_d1;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_d, '2', 'Dispositivi Medici', 'negative', 1) RETURNING id INTO id_d2;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_d, '3', 'Materiale di Consumo', 'negative', 2) RETURNING id INTO id_d3;

  -- ── E: Costi per Servizi ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, NULL, 'E', 'Costi per Servizi', 'negative', 5) RETURNING id INTO id_e;

  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_e, '1', 'Utenze', 'negative', 0) RETURNING id INTO id_e1;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_e, '2', 'Assicurazioni', 'negative', 1) RETURNING id INTO id_e2;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_e, '3', 'Manutenzioni', 'negative', 2) RETURNING id INTO id_e3;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_e, '4', 'Software e Informatica', 'negative', 3) RETURNING id INTO id_e4;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_e, '5', 'Outsourcing', 'negative', 4) RETURNING id INTO id_e5;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_e, '6', 'Marketing', 'negative', 5) RETURNING id INTO id_e6;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_e, '7', 'Consulenze Professionali', 'negative', 6) RETURNING id INTO id_e7;

  -- ── F: Costi Struttura ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, NULL, 'F', 'Costi Struttura', 'negative', 6) RETURNING id INTO id_f;

  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_f, '1', 'Affitti e Locazioni', 'negative', 0) RETURNING id INTO id_f1;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_f, '2', 'Pulizia e Sanificazione', 'negative', 1) RETURNING id INTO id_f2;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_f, '3', 'Vigilanza e Sicurezza', 'negative', 2) RETURNING id INTO id_f3;

  -- ── T2: Margine Operativo Lordo (totale) ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index, is_total)
  VALUES (tmpl_id, NULL, 'T2', 'Margine Operativo Lordo', 'positive', 7, true) RETURNING id INTO id_t2;

  -- ── G: Ammortamenti e Svalutazioni ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, NULL, 'G', 'Ammortamenti e Svalutazioni', 'negative', 8) RETURNING id INTO id_g;

  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_g, '1', 'Ammortamento Attrezzature Medicali', 'negative', 0) RETURNING id INTO id_g1;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_g, '2', 'Ammortamento Arredi', 'negative', 1) RETURNING id INTO id_g2;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_g, '3', 'Ammortamento Software', 'negative', 2) RETURNING id INTO id_g3;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_g, '4', 'Svalutazioni Crediti', 'negative', 3) RETURNING id INTO id_g4;

  -- ── T3: Risultato Operativo (totale) ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index, is_total)
  VALUES (tmpl_id, NULL, 'T3', 'Risultato Operativo', 'positive', 9, true) RETURNING id INTO id_t3;

  -- ── H: Gestione Finanziaria ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, NULL, 'H', 'Gestione Finanziaria', 'negative', 10) RETURNING id INTO id_h;

  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_h, '1', 'Interessi Passivi', 'negative', 0) RETURNING id INTO id_h1;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_h, '2', 'Commissioni Bancarie', 'negative', 1) RETURNING id INTO id_h2;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_h, '3', 'Proventi Finanziari', 'negative', 2) RETURNING id INTO id_h3;

  -- ── T4: Risultato Prima delle Imposte (totale) ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index, is_total)
  VALUES (tmpl_id, NULL, 'T4', 'Risultato Prima delle Imposte', 'positive', 11, true) RETURNING id INTO id_t4;

  -- ── I: Imposte ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, NULL, 'I', 'Imposte', 'negative', 12) RETURNING id INTO id_i;

  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_i, '1', 'IRES', 'negative', 0) RETURNING id INTO id_i1;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_i, '2', 'IRAP', 'negative', 1) RETURNING id INTO id_i2;
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index)
  VALUES (tmpl_id, id_i, '3', 'Imposte Differite', 'negative', 2) RETURNING id INTO id_i3;

  -- ── T5: Risultato Netto (totale) ──
  INSERT INTO reclassification_nodes (template_id, parent_id, code, name, sign, order_index, is_total)
  VALUES (tmpl_id, NULL, 'T5', 'Risultato Netto', 'positive', 13, true) RETURNING id INTO id_t5;

  -- ── Refs for totals ──
  -- T1 = A + B
  INSERT INTO reclassification_node_refs VALUES (id_t1, id_a), (id_t1, id_b);
  -- T2 = T1 + C + D + E + F
  INSERT INTO reclassification_node_refs VALUES (id_t2, id_t1), (id_t2, id_c), (id_t2, id_d), (id_t2, id_e), (id_t2, id_f);
  -- T3 = T2 + G
  INSERT INTO reclassification_node_refs VALUES (id_t3, id_t2), (id_t3, id_g);
  -- T4 = T3 + H
  INSERT INTO reclassification_node_refs VALUES (id_t4, id_t3), (id_t4, id_h);
  -- T5 = T4 + I
  INSERT INTO reclassification_node_refs VALUES (id_t5, id_t4), (id_t5, id_i);
END $$;
