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
  is_active: boolean;
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
  is_active: boolean;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// --- Phase 5: Transactions ---

export type TransactionDirection = "in" | "out";

export type Transaction = {
  id: string;
  organization_id: string;
  collection_resource_id: string;
  subject_id: string | null;
  direction: TransactionDirection;
  amount: number;
  transaction_date: string;
  description: string;
  reference: string | null;
  is_balance_row: boolean;
  reclassification_node_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionAttachment = {
  id: string;
  transaction_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string | null;
  uploaded_at: string;
};

export type TransactionWithDetails = Transaction & {
  collection_resources: CollectionResource;
  subjects: { id: string; first_name: string | null; last_name: string | null; business_name: string | null; type: SubjectType } | null;
  transaction_attachments: TransactionAttachment[];
};

// --- Phase 7: Import ---

export type GeminiMovement = {
  transaction_date: string;
  direction: TransactionDirection;
  amount: number;
  description: string;
  reference: string | null;
  suggested_node_full_code: string | null;
};

export type GeminiResponse = {
  bank_statement: boolean;
  document_totals: {
    total_in: number;
    total_out: number;
  } | null;
  movements: GeminiMovement[];
};

export type ImportPreviewMovement = GeminiMovement & {
  status: "new" | "updated";
  existing_id?: string;
  resolved_node_id?: string | null;
};

export type ImportPreviewResult = {
  movements: ImportPreviewMovement[];
  notFoundInFile: {
    id: string;
    transaction_date: string;
    amount: number;
    direction: TransactionDirection;
    description: string;
  }[];
  bankStatement: boolean;
  documentTotals: { totalIn: number; totalOut: number } | null;
  calculatedTotals: { totalIn: number; totalOut: number };
  totalsMatch: boolean;
};

// --- Phase 6: Reclassification ---

export type ReclassificationNodeSign = "positive" | "negative";

export type ReclassificationTemplate = {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  is_template: boolean;
  is_active: boolean;
  is_base: boolean;
  cloned_from_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ReclassificationNode = {
  id: string;
  template_id: string;
  parent_id: string | null;
  code: string;
  full_code: string;
  name: string;
  sign: ReclassificationNodeSign;
  order_index: number;
  is_total: boolean;
  formula: string | null;
  created_at: string;
  updated_at: string;
};

export type ReclassificationNodeRef = {
  total_node_id: string;
  ref_node_id: string;
};

export type ReclassificationNodeWithChildren = ReclassificationNode & {
  children: ReclassificationNodeWithChildren[];
};
