"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DataGrid } from "@/components/data-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import Link from "next/link";
import {
  FileText,
  Upload,
  Search,
  Trash2,
  Users,
  Loader2,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { deleteInvoiceAction, reconcileSubjectsAction } from "@/app/actions/invoices";
import { ImportDialog } from "./_components/import-dialog";
import { useTranslation } from "@/lib/i18n/context";
import type {
  SdiAccount,
  InvoiceDirection,
  InvoiceDocumentType,
  SubjectReconciliationStatus,
  SubjectType,
} from "@/types/supabase";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

interface InvoiceRow {
  id: string;
  direction: InvoiceDirection;
  document_type: InvoiceDocumentType;
  number: string;
  date: string;
  counterpart_name: string;
  total_taxable: number;
  total_vat: number;
  total_amount: number;
  subject_id: string | null;
  subject_reconciliation_status: SubjectReconciliationStatus;
  subjects: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
    type: SubjectType;
  } | null;
  invoice_payment_schedule: {
    id: string;
    due_date: string;
    amount: number;
    paid_date: string | null;
    paid_amount: number | null;
    transaction_reconciliation_status: string;
  }[];
}

function getSubjectName(s: InvoiceRow["subjects"]): string {
  if (!s) return "";
  if (s.type === "person") return `${s.last_name ?? ""} ${s.first_name ?? ""}`.trim();
  return s.business_name ?? "";
}

function SubjectBadge({ status, t }: { status: SubjectReconciliationStatus; t: (k: string) => string }) {
  const map: Record<SubjectReconciliationStatus, { label: string; className: string }> = {
    confirmed: { label: t("invoices.detail.subjectConfirmed"), className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    created: { label: t("invoices.detail.subjectCreated"), className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
    unmatched: { label: t("invoices.detail.subjectUnmatched"), className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  };
  const info = map[status];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap ${info.className}`}>{info.label}</span>;
}

function DocumentTypeBadge({ type, t }: { type: InvoiceDocumentType; t: (k: string) => string }) {
  const map: Record<InvoiceDocumentType, { label: string; className: string }> = {
    invoice: { label: t("invoices.invoice"), className: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" },
    credit_note: { label: t("invoices.creditNote"), className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
    debit_note: { label: t("invoices.debitNote"), className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  };
  const info = map[type];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap ${info.className}`}>{info.label}</span>;
}

function ScheduleIndicator({ schedule }: { schedule: InvoiceRow["invoice_payment_schedule"] }) {
  if (schedule.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  const allPaid = schedule.every((s) => s.paid_date != null);
  const anyOverdue = schedule.some((s) => !s.paid_date && new Date(s.due_date) < new Date());
  const color = allPaid ? "bg-green-500" : anyOverdue ? "bg-red-500" : "bg-yellow-500";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-xs text-muted-foreground">
        {schedule.filter((s) => s.paid_date != null).length}/{schedule.length}
      </span>
    </div>
  );
}

export default function InvoicesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [canWrite, setCanWrite] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);

  // Data
  const [sdiAccounts, setSdiAccounts] = useState<SdiAccount[]>([]);
  const [sdiLoaded, setSdiLoaded] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [direction, setDirection] = useState<InvoiceDirection>("issued");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("");

  // Dialogs
  const [importOpen, setImportOpen] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);

  useEffect(() => {
    async function init() {
      const res = await fetch("/api/user-info");
      const data = await res.json();
      const roles: string[] = data.roles ?? [];
      if (!roles.includes("business_analyst") && !roles.includes("accountant")) {
        router.push("/dashboard");
        return;
      }
      setCanWrite(roles.includes("accountant"));
      setOrgId(data.profile?.organization_id ?? null);
      setAuthorized(true);
    }
    init();
  }, [router]);

  // Load SDI accounts
  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/sdi-accounts?orgId=${orgId}&includeDeactivated=true`)
      .then((r) => r.json())
      .then((data) => {
        setSdiAccounts(data.accounts ?? []);
        setSdiLoaded(true);
        if (data.accounts?.length > 0 && !selectedAccountId) {
          setSelectedAccountId(data.accounts[0].id);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Load invoices
  const loadInvoices = useCallback(async () => {
    if (!orgId || !selectedAccountId) return;
    setLoading(true);
    const params = new URLSearchParams({ orgId, sdiAccountId: selectedAccountId, direction });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (search) params.set("search", search);
    if (docType) params.set("documentType", docType);

    const res = await fetch(`/api/invoices?${params}`);
    const data = await res.json();
    setInvoices(data.invoices ?? []);
    setLoading(false);
  }, [orgId, selectedAccountId, direction, dateFrom, dateTo, search, docType]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  async function handleDelete(rows: InvoiceRow[]) {
    for (const row of rows) {
      const res = await deleteInvoiceAction(row.id);
      if (res.error) { toast.error(res.error); return; }
    }
    toast.success(t("invoices.deleted"));
    loadInvoices();
  }

  async function handleReconcileSubjects() {
    setIsReconciling(true);
    const res = await reconcileSubjectsAction();
    if ("error" in res) {
      toast.error(res.error);
    } else {
      toast.success(`${t("invoices.reconciliation.subjectsReconciled")}: ${res.reconciled} — ${t("invoices.subjectsCreated")}: ${res.created}`);
      loadInvoices();
    }
    setIsReconciling(false);
  }

  const columnDefs = useMemo<ColDef<InvoiceRow>[]>(() => [
    {
      field: "date",
      headerName: t("invoices.date"),
      width: 110,
      sort: "desc",
    },
    {
      field: "number",
      headerName: t("invoices.number"),
      width: 120,
    },
    {
      field: "document_type",
      headerName: t("invoices.type"),
      width: 130,
      cellRenderer: (params: ICellRendererParams<InvoiceRow>) =>
        params.data ? <DocumentTypeBadge type={params.data.document_type} t={t} /> : null,
    },
    {
      field: "counterpart_name",
      headerName: t("invoices.counterpart"),
      flex: 1,
      minWidth: 200,
    },
    {
      field: "subject_reconciliation_status",
      headerName: t("invoices.subjectReconciliation"),
      width: 140,
      cellRenderer: (params: ICellRendererParams<InvoiceRow>) =>
        params.data ? <SubjectBadge status={params.data.subject_reconciliation_status} t={t} /> : null,
    },
    {
      field: "total_taxable",
      headerName: t("invoices.taxable"),
      width: 110,
      type: "numericColumn",
      valueFormatter: (params) => params.value != null ? Number(params.value).toFixed(2) : "",
    },
    {
      field: "total_vat",
      headerName: t("invoices.vat"),
      width: 100,
      type: "numericColumn",
      valueFormatter: (params) => params.value != null ? Number(params.value).toFixed(2) : "",
    },
    {
      field: "total_amount",
      headerName: t("invoices.total"),
      width: 120,
      type: "numericColumn",
      valueFormatter: (params) => params.value != null ? Number(params.value).toFixed(2) : "",
    },
    {
      headerName: t("invoices.paymentSchedule"),
      width: 110,
      cellRenderer: (params: ICellRendererParams<InvoiceRow>) =>
        params.data ? <ScheduleIndicator schedule={params.data.invoice_payment_schedule} /> : null,
    },
  ], [t]);

  if (!authorized) return null;

  // No SDI accounts configured — prompt to go to settings
  if (sdiLoaded && sdiAccounts.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          {t("invoices.title")}
        </h1>
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500" />
          <h2 className="text-lg font-semibold">{t("invoices.noSdiAccounts")}</h2>
          <Link href="/settings">
            <Button className="cursor-pointer">
              <Settings className="h-4 w-4 mr-2" />
              {t("invoices.goToSettings")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="h-6 w-6" />
        {t("invoices.title")}
      </h1>

      {/* SDI Account selector */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Select value={selectedAccountId} onValueChange={(v) => setSelectedAccountId(v ?? "")}>
            <SelectTrigger className="!w-full">
              <SelectValue placeholder={t("invoices.selectSdiAccount")}>
                {sdiAccounts.find((a) => a.id === selectedAccountId)?.name ?? null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sdiAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name} ({a.code})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Direction tabs */}
        <div className="flex border rounded-md overflow-hidden">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium cursor-pointer transition-colors ${
              direction === "issued" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
            onClick={() => setDirection("issued")}
          >
            {t("invoices.issued")}
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium cursor-pointer transition-colors ${
              direction === "received" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
            onClick={() => setDirection("received")}
          >
            {t("invoices.received")}
          </button>
        </div>

        {/* Filters */}
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-36"
          placeholder="Da"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-36"
          placeholder="A"
        />
        <div className="w-40">
          <Select value={docType} onValueChange={(v) => setDocType(!v || v === "all" ? "" : v)}>
            <SelectTrigger className="!w-full">
              <SelectValue placeholder={t("invoices.type")}>
                {docType === "invoice" ? t("invoices.invoice") :
                 docType === "credit_note" ? t("invoices.creditNote") :
                 docType === "debit_note" ? t("invoices.debitNote") :
                 null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.none")}</SelectItem>
              <SelectItem value="invoice">{t("invoices.invoice")}</SelectItem>
              <SelectItem value="credit_note">{t("invoices.creditNote")}</SelectItem>
              <SelectItem value="debit_note">{t("invoices.debitNote")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="pl-8 w-48"
          />
        </div>
      </div>

      {/* Actions bar */}
      {canWrite && (
        <div className="flex gap-2">
          <Button size="sm" className="cursor-pointer" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            {t("invoices.import")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer"
            onClick={handleReconcileSubjects}
            disabled={isReconciling}
          >
            {isReconciling ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Users className="h-4 w-4 mr-1" />}
            {t("invoices.detail.reconcileSubjects")}
          </Button>
        </div>
      )}

      {!selectedAccountId ? (
        <div className="text-center py-12 text-muted-foreground">
          {t("invoices.selectSdiAccountFirst")}
        </div>
      ) : (
        <DataGrid
          rowData={invoices}
          columnDefs={columnDefs}
          exportFileName="fatture"
          gridId="invoices-grid"
          onDelete={canWrite ? handleDelete : undefined}
          onEdit={(row) => router.push(`/invoices/${row.id}`)}
          renderMobileCard={(inv) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{inv.number}</span>
                  <DocumentTypeBadge type={inv.document_type} t={t} />
                </div>
                <p className="text-sm truncate">{inv.counterpart_name}</p>
                <p className="text-xs text-muted-foreground">{inv.date}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono font-bold">{Number(inv.total_amount).toFixed(2)}</p>
                <SubjectBadge status={inv.subject_reconciliation_status} t={t} />
              </div>
            </div>
          )}
        />
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        sdiAccounts={sdiAccounts.filter((a) => a.is_active)}
        selectedAccountId={selectedAccountId}
        onImportComplete={loadInvoices}
      />
    </div>
  );
}
