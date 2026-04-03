export type Organization = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  currency: string;
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
  locale: string;
  date_format: string;
  time_format: string;
  decimal_separator: string;
  thousands_separator: string;
  created_at: string;
  updated_at: string;
};

export type Role = {
  id: string;
  name: "superadmin" | "user_manager" | "business_analyst" | "accountant";
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

// --- Phase 2: Subjects ---

export type SubjectType = "person" | "company" | "sole_trader" | "public_administration";
export type ContactType = "phone" | "mobile" | "email" | "pec";

export type Subject = {
  id: string;
  organization_id: string;
  type: SubjectType;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  birth_place: string | null;
  gender: string | null;
  business_name: string | null;
  tax_code: string | null;
  vat_number: string | null;
  sdi_code: string | null;
  iban: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SubjectAddress = {
  id: string;
  subject_id: string;
  label: string | null;
  is_primary: boolean;
  country_code: string;
  street: string | null;
  zip_code: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
  created_at: string;
};

export type SubjectContact = {
  id: string;
  subject_id: string;
  type: ContactType;
  label: string | null;
  value: string;
  is_primary: boolean;
  created_at: string;
};

export type Tag = {
  id: string;
  organization_id: string;
  name: string;
  color: string;
};

export type SubjectTag = {
  subject_id: string;
  tag_id: string;
};

export type SubjectWithDetails = Subject & {
  subject_addresses: SubjectAddress[];
  subject_contacts: SubjectContact[];
  subject_tags: (SubjectTag & { tags: Tag })[];
};

// --- VAT Codes ---

export type VatCode = {
  id: string;
  organization_id: string;
  code: string;
  description: string;
  rate: number;
  nature: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// --- Phase 3: Collection Resources ---

export type CollectionResourceType = "bank_account" | "online_platform" | "cash" | "other";

export type CollectionResource = {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  type: CollectionResourceType;
  iban: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// --- Phase 4: Payment Types ---

export type PaymentType = {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  is_system: boolean;
  is_active: boolean;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
