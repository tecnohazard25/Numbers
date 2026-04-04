"use client";

import { useMemo, useState } from "react";
import { DataGrid } from "@/components/data-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CreditCard, Loader2, Save, X, Sparkles, Check } from "lucide-react";
import { markPaymentPaidAction } from "@/app/actions/invoices";
import {
  reconcilePaymentsAction,
  confirmPaymentMatchesAction,
  type PaymentMatch,
} from "@/app/actions/gemini-invoices";
import { useTranslation } from "@/lib/i18n/context";
import type { InvoicePaymentSchedule, ReconciliationStatus } from "@/types/supabase";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

interface Props {
  payments: InvoicePaymentSchedule[];
  invoiceId: string;
  canWrite: boolean;
  onUpdate: () => void;
}

function ReconciliationBadge({ status, t }: { status: ReconciliationStatus; t: (k: string) => string }) {
  const map: Record<ReconciliationStatus, { label: string; className: string }> = {
    unmatched: { label: t("invoices.reconciliation.unmatched"), className: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" },
    suggested: { label: t("invoices.reconciliation.suggested"), className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
    confirmed: { label: t("invoices.reconciliation.confirmed"), className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    excluded: { label: t("invoices.reconciliation.excluded"), className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  };
  const info = map[status];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${info.className}`}>{info.label}</span>;
}

function ConfidenceBadge({ confidence, t }: { confidence: string; t: (k: string) => string }) {
  const map: Record<string, { label: string; className: string }> = {
    high: { label: t("invoices.reconciliation.high"), className: "text-green-600" },
    medium: { label: t("invoices.reconciliation.medium"), className: "text-yellow-600" },
    low: { label: t("invoices.reconciliation.low"), className: "text-red-600" },
  };
  const info = map[confidence] ?? map.low;
  return <span className={`text-xs font-medium ${info.className}`}>{info.label}</span>;
}

export function PaymentsTab({ payments, invoiceId, canWrite, onUpdate }: Props) {
  const { t } = useTranslation();
  const [markPaidTarget, setMarkPaidTarget] = useState<InvoicePaymentSchedule | null>(null);
  const [paidDate, setPaidDate] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI reconciliation state
  const [isReconciling, setIsReconciling] = useState(false);
  const [matches, setMatches] = useState<PaymentMatch[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);

  function openMarkPaid(payment: InvoicePaymentSchedule) {
    setMarkPaidTarget(payment);
    setPaidDate(new Date().toISOString().split("T")[0]);
    setPaidAmount(String(payment.amount));
  }

  async function handleMarkPaid() {
    if (!markPaidTarget || !paidDate || !paidAmount) return;
    setIsSubmitting(true);
    const res = await markPaymentPaidAction(markPaidTarget.id, paidDate, Number(paidAmount));
    if (res.error) toast.error(res.error);
    else {
      toast.success(t("common.save"));
      setMarkPaidTarget(null);
      onUpdate();
    }
    setIsSubmitting(false);
  }

  async function handleReconcile() {
    setIsReconciling(true);
    const res = await reconcilePaymentsAction(invoiceId);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      setMatches(res.matches);
      const selected = new Set<string>();
      for (const m of res.matches) {
        if (m.suggested_transaction_id) selected.add(m.schedule_id);
      }
      setSelectedMatches(selected);
      setPreviewOpen(true);
    }
    setIsReconciling(false);
  }

  async function handleConfirmMatches() {
    setIsConfirming(true);
    const toConfirm = matches
      .filter((m) => selectedMatches.has(m.schedule_id) && m.suggested_transaction_id)
      .map((m) => ({ scheduleId: m.schedule_id, transactionId: m.suggested_transaction_id! }));

    const res = await confirmPaymentMatchesAction(toConfirm);
    if (res.error) toast.error(res.error);
    else {
      toast.success(t("invoices.reconciliation.confirmed"));
      setPreviewOpen(false);
      onUpdate();
    }
    setIsConfirming(false);
  }

  function toggleMatch(scheduleId: string) {
    const next = new Set(selectedMatches);
    if (next.has(scheduleId)) next.delete(scheduleId);
    else next.add(scheduleId);
    setSelectedMatches(next);
  }

  const columnDefs = useMemo<ColDef<InvoicePaymentSchedule>[]>(() => [
    {
      field: "due_date",
      headerName: t("invoices.detail.dueDate"),
      width: 120,
      sort: "asc",
      cellRenderer: (params: ICellRendererParams<InvoicePaymentSchedule>) => {
        if (!params.data) return null;
        const overdue = !params.data.paid_date && new Date(params.data.due_date) < new Date();
        return <span className={overdue ? "text-destructive font-medium" : ""}>{params.value}</span>;
      },
    },
    {
      field: "amount",
      headerName: t("invoices.detail.amount"),
      width: 120,
      type: "numericColumn",
      valueFormatter: (params) => params.value != null ? Number(params.value).toFixed(2) : "",
    },
    {
      field: "paid_date",
      headerName: t("invoices.detail.paidDate"),
      width: 120,
      valueFormatter: (params) => params.value ?? "—",
    },
    {
      field: "paid_amount",
      headerName: t("invoices.detail.paidAmount"),
      width: 120,
      type: "numericColumn",
      valueFormatter: (params) => params.value != null ? Number(params.value).toFixed(2) : "—",
    },
    {
      field: "transaction_reconciliation_status",
      headerName: t("invoices.reconciliation"),
      width: 130,
      cellRenderer: (params: ICellRendererParams<InvoicePaymentSchedule>) =>
        params.data ? <ReconciliationBadge status={params.data.transaction_reconciliation_status} t={t} /> : null,
    },
    ...(canWrite ? [{
      headerName: t("common.actions"),
      width: 140,
      cellRenderer: (params: ICellRendererParams<InvoicePaymentSchedule>) => {
        if (!params.data || params.data.paid_date) return null;
        return (
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer h-7 text-xs"
            onClick={() => openMarkPaid(params.data!)}
          >
            <CreditCard className="h-3 w-3 mr-1" />
            {t("invoices.detail.markPaid")}
          </Button>
        );
      },
    } as ColDef<InvoicePaymentSchedule>] : []),
  ], [t, canWrite]);

  if (payments.length === 0) {
    return <p className="text-muted-foreground text-center py-8">{t("invoices.detail.noPayments")}</p>;
  }

  return (
    <>
      <div className="space-y-3">
        {canWrite && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={handleReconcile} disabled={isReconciling}>
              {isReconciling ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {t("invoices.detail.reconcilePayments")}
            </Button>
          </div>
        )}

        <DataGrid
          rowData={payments}
          columnDefs={columnDefs}
          pagination={false}
          exportFileName="fattura-scadenzario"
          gridId="invoice-payments-grid"
        />
      </div>

      {/* Mark as Paid Dialog */}
      <Dialog open={!!markPaidTarget} onOpenChange={(open) => !open && setMarkPaidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invoices.detail.markPaid")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("invoices.detail.paidDateLabel")}</Label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("invoices.detail.paidAmountLabel")}</Label>
              <Input type="number" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button className="cursor-pointer" onClick={handleMarkPaid} disabled={isSubmitting || !paidDate || !paidAmount}>
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {t("common.save")}
            </Button>
            <Button variant="outline" className="cursor-pointer" onClick={() => setMarkPaidTarget(null)}>
              <X className="h-4 w-4 mr-1" />
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{t("invoices.detail.reconcilePayments")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {matches.map((m) => (
              <div
                key={m.schedule_id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${selectedMatches.has(m.schedule_id) ? "border-primary bg-primary/5" : ""}`}
              >
                <input
                  type="checkbox"
                  className="cursor-pointer"
                  checked={selectedMatches.has(m.schedule_id)}
                  onChange={() => toggleMatch(m.schedule_id)}
                  disabled={!m.suggested_transaction_id}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    {m.due_date} — <span className="font-mono font-bold">{Number(m.amount).toFixed(2)}</span>
                  </p>
                  {m.suggested_transaction_desc ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>→ {m.suggested_transaction_date} — {m.suggested_transaction_desc}</span>
                      <ConfidenceBadge confidence={m.confidence} t={t} />
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("invoices.reconciliation.noMatches")}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button className="cursor-pointer" onClick={handleConfirmMatches} disabled={isConfirming || selectedMatches.size === 0}>
              {isConfirming ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              {t("invoices.reconciliation.confirmAll")} ({selectedMatches.size})
            </Button>
            <Button variant="outline" className="cursor-pointer" onClick={() => setPreviewOpen(false)}>
              <X className="h-4 w-4 mr-1" />
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
