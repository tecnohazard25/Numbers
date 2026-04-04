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
  description: string | null;
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

// --- Phase 8: Entities ---

export type EntityType = "branch" | "workplace" | "room" | "doctor" | "activity";

export type Entity = {
  id: string;
  organization_id: string;
  type: EntityType;
  code: string;
  name: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Workplace
  workplace_address: string | null;
  // Room
  room_workplace_id: string | null;
  // Activity
  activity_branch_id: string | null;
  activity_avg_selling_price: number | null;
  activity_duration_minutes: number | null;
  activity_avg_cost_lab: number | null;
  activity_avg_cost_staff: number | null;
  activity_avg_cost_materials: number | null;
};

export type EntityDoctorBranch = {
  doctor_id: string;
  branch_id: string;
};

export type EntityDoctorWorkplace = {
  doctor_id: string;
  workplace_id: string;
};

export type EntityActivityWorkplace = {
  activity_id: string;
  workplace_id: string;
};

export type EntityRelated = {
  id: string;
  name: string;
  code: string;
};

export type EntityWithRelations = Entity & {
  room_workplace?: EntityRelated | null;
  activity_branch?: EntityRelated | null;
  entity_doctor_branches?: { branch_id: string; entities: EntityRelated }[];
  entity_doctor_workplaces?: { workplace_id: string; entities: EntityRelated }[];
  entity_activity_workplaces?: { workplace_id: string; entities: EntityRelated }[];
};

// --- Phase 9: Electronic Invoices ---

export type InvoiceDirection = "issued" | "received";
export type InvoiceDocumentType = "invoice" | "credit_note" | "debit_note";
export type ReconciliationStatus = "unmatched" | "suggested" | "confirmed" | "excluded";
export type SubjectReconciliationStatus = "unmatched" | "confirmed" | "created";

export type SdiAccount = {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  pec: string | null;
  fiscal_code: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  organization_id: string;
  sdi_account_id: string;
  direction: InvoiceDirection;
  document_type: InvoiceDocumentType;
  sdi_id: string | null;
  sdi_status: string | null;
  number: string;
  date: string;
  currency: string;
  total_taxable: number;
  total_vat: number;
  total_amount: number;
  counterpart_name: string;
  counterpart_fiscal_code: string | null;
  counterpart_vat: string | null;
  counterpart_address: string | null;
  payment_method: string | null;
  subject_id: string | null;
  subject_reconciliation_status: SubjectReconciliationStatus;
  xml_content: string;
  xml_hash: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  line_number: number;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number;
  vat_rate: number | null;
  vat_nature: string | null;
  suggested_activity_id: string | null;
  confirmed_activity_id: string | null;
  activity_reconciliation_status: ReconciliationStatus;
};

export type InvoicePaymentSchedule = {
  id: string;
  invoice_id: string;
  due_date: string;
  amount: number;
  paid_date: string | null;
  paid_amount: number | null;
  suggested_transaction_id: string | null;
  confirmed_transaction_id: string | null;
  transaction_reconciliation_status: ReconciliationStatus;
};

export type InvoiceWithDetails = Invoice & {
  invoice_lines: InvoiceLine[];
  invoice_payment_schedule: InvoicePaymentSchedule[];
  subjects: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
    type: SubjectType;
  } | null;
  sdi_accounts: {
    id: string;
    name: string;
    code: string;
  } | null;
};
