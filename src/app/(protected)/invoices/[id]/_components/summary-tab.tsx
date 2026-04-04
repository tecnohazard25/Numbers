"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { User, Building2, Link, Loader2 } from "lucide-react";
import { updateInvoiceSubjectAction } from "@/app/actions/invoices";
import { useTranslation } from "@/lib/i18n/context";
import type { InvoiceWithDetails, Subject } from "@/types/supabase";

interface Props {
  invoice: InvoiceWithDetails;
  subjects: Subject[];
  onUpdate: () => void;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  invoice: "invoices.invoice",
  credit_note: "invoices.creditNote",
  debit_note: "invoices.debitNote",
};

const DIRECTION_LABELS: Record<string, string> = {
  issued: "invoices.issued",
  received: "invoices.received",
};

export function SummaryTab({ invoice, subjects, onUpdate }: Props) {
  const { t } = useTranslation();
  const [linking, setLinking] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState(invoice.subject_id ?? "");

  async function handleLinkSubject() {
    if (!selectedSubjectId) return;
    setLinking(true);
    const res = await updateInvoiceSubjectAction(invoice.id, selectedSubjectId);
    if (res.error) toast.error(res.error);
    else { toast.success(t("invoices.detail.subjectLinked")); onUpdate(); }
    setLinking(false);
  }

  function getSubjectLabel(s: Subject) {
    if (s.type === "person") return `${s.last_name ?? ""} ${s.first_name ?? ""}`.trim();
    return s.business_name ?? "";
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Invoice Info */}
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          {t("invoices.detail.invoiceInfo")}
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <InfoRow label={t("invoices.number")} value={invoice.number} />
          <InfoRow label={t("invoices.date")} value={invoice.date} />
          <InfoRow label={t("invoices.type")} value={t(DOCUMENT_TYPE_LABELS[invoice.document_type] ?? "")} />
          <InfoRow label={t("invoices.direction")} value={t(DIRECTION_LABELS[invoice.direction] ?? "")} />
          <InfoRow label={t("invoices.currency")} value={invoice.currency} />
          {invoice.payment_method && (
            <InfoRow label={t("invoices.paymentMethod")} value={invoice.payment_method} />
          )}
          {invoice.sdi_accounts && (
            <InfoRow label="SDI" value={`${invoice.sdi_accounts.name} (${invoice.sdi_accounts.code})`} />
          )}
        </div>
      </div>

      {/* Counterpart Info */}
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          {t("invoices.detail.counterpartInfo")}
        </h3>
        <div className="grid grid-cols-1 gap-2 text-sm">
          <InfoRow label={t("common.name")} value={invoice.counterpart_name} />
          {invoice.counterpart_fiscal_code && (
            <InfoRow label="CF" value={invoice.counterpart_fiscal_code} />
          )}
          {invoice.counterpart_vat && (
            <InfoRow label="P.IVA" value={invoice.counterpart_vat} />
          )}
          {invoice.counterpart_address && (
            <InfoRow label="Indirizzo" value={invoice.counterpart_address} />
          )}
        </div>

        {/* Subject reconciliation */}
        <div className="pt-2 border-t space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4" />
            <span className="font-medium">{t("invoices.subject")}:</span>
            {invoice.subjects ? (
              <span className="text-green-600 flex items-center gap-1">
                {invoice.subjects.type === "person"
                  ? `${invoice.subjects.last_name ?? ""} ${invoice.subjects.first_name ?? ""}`.trim()
                  : invoice.subjects.business_name}
              </span>
            ) : (
              <span className="text-muted-foreground">{t("invoices.detail.subjectUnmatched")}</span>
            )}
          </div>
          {!invoice.subjects && (
            <div className="flex items-center gap-2">
              <Select value={selectedSubjectId} onValueChange={(v) => setSelectedSubjectId(v ?? "")}>
                <SelectTrigger className="!w-full text-sm">
                  <SelectValue placeholder={t("invoices.detail.selectSubject")}>
                    {subjects.find((s) => s.id === selectedSubjectId)
                      ? getSubjectLabel(subjects.find((s) => s.id === selectedSubjectId)!)
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{getSubjectLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="cursor-pointer shrink-0" onClick={handleLinkSubject} disabled={!selectedSubjectId || linking}>
                {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Totals */}
      <div className="rounded-lg border p-4 space-y-3 md:col-span-2">
        <h3 className="font-semibold text-sm">{t("invoices.detail.totals")}</h3>
        <div className="grid grid-cols-3 gap-4">
          <TotalCard label={t("invoices.taxable")} value={Number(invoice.total_taxable)} />
          <TotalCard label={t("invoices.vat")} value={Number(invoice.total_vat)} />
          <TotalCard label={t("invoices.total")} value={Number(invoice.total_amount)} highlight />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="font-medium">{value}</span>
    </div>
  );
}

function TotalCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`text-center p-3 rounded-lg ${highlight ? "bg-primary/10" : "bg-muted/50"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-mono font-bold ${highlight ? "text-primary" : ""}`}>
        {value.toFixed(2)}
      </p>
    </div>
  );
}
