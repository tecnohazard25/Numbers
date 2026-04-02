export type Organization = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  locale: string;
  currency: string;
  date_format: string;
  time_format: string;
  decimal_separator: string;
  thousands_separator: string;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  organization_id: string | null;
  first_name: string;
  last_name: string;
  is_active: boolean;
  password_expires_at: string;
  created_at: string;
  updated_at: string;
};

export type Role = {
  id: string;
  name: "superadmin" | "org_admin" | "business_analyst" | "accountant";
  description: string | null;
};

export type UserRole = {
  user_id: string;
  role_id: string;
  assigned_at: string;
  assigned_by: string | null;
};

export type ProfileWithRoles = Profile & {
  email?: string;
  user_roles: (UserRole & { roles: Role })[];
};

export type UserWithDetails = ProfileWithRoles & {
  organizations?: Organization | null;
};
