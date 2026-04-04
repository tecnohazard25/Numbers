"use client";

import { useMemo, useState } from "react";
import { DataGrid } from "@/components/data-grid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sparkles, Loader2, Check, X } from "lucide-react";
import {
  reconcileActivitiesAction,
  confirmActivityMatchesAction,
  type ActivityMatch,
} from "@/app/actions/gemini-invoices";
import { useTranslation } from "@/lib/i18n/context";
import type { InvoiceLine, InvoiceDirection } from "@/types/supabase";
import type { ColDef } from "ag-grid-community";

interface Props {
  lines: InvoiceLine[];
  direction: InvoiceDirection;
  invoiceId: string;
  canWrite: boolean;
  onUpdate: () => void;
}

function ReconciliationBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const map: Record<string, { label: string; className: string }> = {
    unmatched: { label: t("invoices.reconciliation.unmatched"), className: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" },
    suggested: { label: t("invoices.reconciliation.suggested"), className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
    confirmed: { label: t("invoices.reconciliation.confirmed"), className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    excluded: { label: t("invoices.reconciliation.excluded"), className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  };
  const info = map[status] ?? map.unmatched;
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

export function LinesTab({ lines, direction, invoiceId, canWrite, onUpdate }: Props) {
  const { t } = useTranslation();
  const [isReconciling, setIsReconciling] = useState(false);
  const [matches, setMatches] = useState<ActivityMatch[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleReconcile() {
    setIsReconciling(true);
    const res = await reconcileActivitiesAction(invoiceId);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      setMatches(res.matches);
      // Auto-select all matches with suggestions
      const selected = new Set<string>();
      for (const m of res.matches) {
        if (m.suggested_activity_id) selected.add(m.line_id);
      }
      setSelectedMatches(selected);
      setPreviewOpen(true);
    }
    setIsReconciling(false);
  }

  async function handleConfirm() {
    setIsConfirming(true);
    const toConfirm = matches
      .filter((m) => selectedMatches.has(m.line_id) && m.suggested_activity_id)
      .map((m) => ({ lineId: m.line_id, activityId: m.suggested_activity_id! }));

    const res = await confirmActivityMatchesAction(toConfirm);
    if (res.error) toast.error(res.error);
    else {
      toast.success(t("invoices.reconciliation.confirmed"));
      setPreviewOpen(false);
      onUpdate();
    }
    setIsConfirming(false);
  }

  function toggleMatch(lineId: string) {
    const next = new Set(selectedMatches);
    if (next.has(lineId)) next.delete(lineId);
    else next.add(lineId);
    setSelectedMatches(next);
  }

  const columnDefs = useMemo<ColDef<InvoiceLine>[]>(() => {
    const cols: ColDef<InvoiceLine>[] = [
      { field: "line_number", headerName: t("invoices.detail.lineNumber"), width: 60, sort: "asc" },
      { field: "description", headerName: t("invoices.detail.description"), flex: 1, minWidth: 200 },
      { field: "quantity", headerName: t("invoices.detail.quantity"), width: 100, type: "numericColumn", valueFormatter: (p) => p.value != null ? Number(p.value).toFixed(2) : "" },
      { field: "unit_price", headerName: t("invoices.detail.unitPrice"), width: 120, type: "numericColumn", valueFormatter: (p) => p.value != null ? Number(p.value).toFixed(4) : "" },
      { field: "total_price", headerName: t("invoices.detail.totalPrice"), width: 120, type: "numericColumn", valueFormatter: (p) => p.value != null ? Number(p.value).toFixed(2) : "" },
      { field: "vat_rate", headerName: t("invoices.detail.vatRate"), width: 80, type: "numericColumn", valueFormatter: (p) => p.value != null ? `${Number(p.value).toFixed(0)}%` : "" },
      { field: "vat_nature", headerName: t("invoices.detail.vatNature"), width: 80 },
    ];

    if (direction === "issued") {
      cols.push({
        field: "activity_reconciliation_status",
        headerName: t("invoices.detail.activity"),
        width: 130,
        cellRenderer: (params: { value: string }) => <ReconciliationBadge status={params.value} t={t} />,
      });
    }

    return cols;
  }, [t, direction]);

  if (lines.length === 0) {
    return <p className="text-muted-foreground text-center py-8">{t("invoices.detail.noLines")}</p>;
  }

  return (
    <div className="space-y-3">
      {direction === "issued" && canWrite && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={handleReconcile} disabled={isReconciling}>
            {isReconciling ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {t("invoices.detail.reconcileActivities")}
          </Button>
        </div>
      )}

      <DataGrid
        rowData={lines}
        columnDefs={columnDefs}
        pagination={false}
        exportFileName="fattura-righe"
        gridId="invoice-lines-grid"
      />

      {/* AI Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{t("invoices.detail.reconcileActivities")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {matches.map((m) => (
              <div
                key={m.line_id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${selectedMatches.has(m.line_id) ? "border-primary bg-primary/5" : ""}`}
              >
                <input
                  type="checkbox"
                  className="cursor-pointer"
                  checked={selectedMatches.has(m.line_id)}
                  onChange={() => toggleMatch(m.line_id)}
                  disabled={!m.suggested_activity_id}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{m.line_description || "—"}</p>
                  {m.suggested_activity_name ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>→ {m.suggested_activity_name}</span>
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
            <Button className="cursor-pointer" onClick={handleConfirm} disabled={isConfirming || selectedMatches.size === 0}>
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
    </div>
  );
}
