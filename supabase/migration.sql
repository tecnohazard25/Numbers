-- ============================================
-- Gestionale Centro Medico - Fase 1 Migration
-- ============================================

-- 1. Organizations
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- 2. Profiles (extends auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  password_expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 3. Roles
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Seed roles
INSERT INTO roles (name, description) VALUES
  ('superadmin', 'Accesso totale al sistema, gestione organization'),
  ('org_admin', 'Amministratore di una singola organization'),
  ('business_analyst', 'Analista business della organization'),
  ('accountant', 'Contabile della organization');

-- 4. User Roles
CREATE TABLE user_roles (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role_id uuid REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Triggers for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Trigger: auto-create profile on auth signup
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, organization_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'organization_id' IS NOT NULL
      THEN (NEW.raw_user_meta_data->>'organization_id')::uuid
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- RLS Policies
-- ============================================

-- Helper function to get current user's organization
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS uuid AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check if user has a specific role
CREATE OR REPLACE FUNCTION has_role(role_name text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = role_name
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Organizations policies
CREATE POLICY "Superadmin can do everything on organizations"
  ON organizations FOR ALL
  USING (has_role('superadmin'));

CREATE POLICY "Users can view their own organization"
  ON organizations FOR SELECT
  USING (id = get_user_organization_id());

-- Profiles policies
CREATE POLICY "Superadmin can do everything on profiles"
  ON profiles FOR ALL
  USING (has_role('superadmin'));

CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Org admin can view profiles in their organization"
  ON profiles FOR SELECT
  USING (
    has_role('org_admin')
    AND organization_id = get_user_organization_id()
  );

CREATE POLICY "Org admin can update profiles in their organization"
  ON profiles FOR UPDATE
  USING (
    has_role('org_admin')
    AND organization_id = get_user_organization_id()
  );

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Roles policies (readable by all authenticated)
CREATE POLICY "Authenticated users can view roles"
  ON roles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- User Roles policies
CREATE POLICY "Superadmin can do everything on user_roles"
  ON user_roles FOR ALL
  USING (has_role('superadmin'));

CREATE POLICY "Users can view their own roles"
  ON user_roles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Org admin can view user_roles in their organization"
  ON user_roles FOR SELECT
  USING (
    has_role('org_admin')
    AND user_id IN (
      SELECT id FROM profiles WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Org admin can manage user_roles in their organization"
  ON user_roles FOR INSERT
  WITH CHECK (
    has_role('org_admin')
    AND user_id IN (
      SELECT id FROM profiles WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Org admin can delete user_roles in their organization"
  ON user_roles FOR DELETE
  USING (
    has_role('org_admin')
    AND user_id IN (
      SELECT id FROM profiles WHERE organization_id = get_user_organization_id()
    )
  );
