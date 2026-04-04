-- Migration 013: Entities (Branche, Workplaces, Rooms, Doctors, Activities)
-- Fase 8 del gestionale centro medico

-- 1. Tipo enumerativo
CREATE TYPE entity_type AS ENUM (
  'branch',
  'workplace',
  'room',
  'doctor',
  'activity'
);

-- 2. Tabella principale
CREATE TABLE entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type entity_type NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Campi workplace
  workplace_address text,

  -- Campi room
  room_workplace_id uuid REFERENCES entities(id) ON DELETE SET NULL,

  -- Campi activity
  activity_branch_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  activity_avg_selling_price numeric(10,2),
  activity_duration_minutes integer,
  activity_avg_cost_lab numeric(10,2),
  activity_avg_cost_staff numeric(10,2),
  activity_avg_cost_materials numeric(10,2),

  -- Codice univoco per organization + type
  CONSTRAINT unique_code_per_org_type UNIQUE (organization_id, type, code),

  -- Vincoli di integrità per tipo
  CONSTRAINT check_room_has_workplace CHECK (
    type != 'room' OR room_workplace_id IS NOT NULL
  ),
  CONSTRAINT check_room_workplace_nulls CHECK (
    type = 'room' OR room_workplace_id IS NULL
  ),
  CONSTRAINT check_activity_fields CHECK (
    type = 'activity' OR (
      activity_branch_id IS NULL AND
      activity_avg_selling_price IS NULL AND
      activity_duration_minutes IS NULL AND
      activity_avg_cost_lab IS NULL AND
      activity_avg_cost_staff IS NULL AND
      activity_avg_cost_materials IS NULL
    )
  ),
  CONSTRAINT check_workplace_address CHECK (
    type = 'workplace' OR workplace_address IS NULL
  )
);

-- 3. Indici
CREATE INDEX idx_entities_org_type ON entities(organization_id, type);

-- 4. Trigger per aggiornamento automatico di updated_at
CREATE OR REPLACE FUNCTION update_entities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION update_entities_updated_at();

-- 5. Tabelle di giunzione

-- Doctor ↔ Branch (M:N)
CREATE TABLE entity_doctor_branches (
  doctor_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (doctor_id, branch_id)
);

-- Doctor ↔ Workplace (M:N)
CREATE TABLE entity_doctor_workplaces (
  doctor_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  workplace_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (doctor_id, workplace_id)
);

-- Activity ↔ Workplace (M:N)
CREATE TABLE entity_activity_workplaces (
  activity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  workplace_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, workplace_id)
);

-- 6. Row Level Security

-- entities
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entities_read" ON entities
  FOR SELECT
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "entities_write" ON entities
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

-- entity_doctor_branches
ALTER TABLE entity_doctor_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_doctor_branches_read" ON entity_doctor_branches
  FOR SELECT USING (
    doctor_id IN (SELECT id FROM entities WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    ))
  );

CREATE POLICY "entity_doctor_branches_write" ON entity_doctor_branches
  FOR ALL USING (
    doctor_id IN (SELECT id FROM entities WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    ))
    AND EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'accountant'
    )
  );

-- entity_doctor_workplaces
ALTER TABLE entity_doctor_workplaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_doctor_workplaces_read" ON entity_doctor_workplaces
  FOR SELECT USING (
    doctor_id IN (SELECT id FROM entities WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    ))
  );

CREATE POLICY "entity_doctor_workplaces_write" ON entity_doctor_workplaces
  FOR ALL USING (
    doctor_id IN (SELECT id FROM entities WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    ))
    AND EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'accountant'
    )
  );

-- entity_activity_workplaces
ALTER TABLE entity_activity_workplaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_activity_workplaces_read" ON entity_activity_workplaces
  FOR SELECT USING (
    activity_id IN (SELECT id FROM entities WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    ))
  );

CREATE POLICY "entity_activity_workplaces_write" ON entity_activity_workplaces
  FOR ALL USING (
    activity_id IN (SELECT id FROM entities WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    ))
    AND EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'accountant'
    )
  );
