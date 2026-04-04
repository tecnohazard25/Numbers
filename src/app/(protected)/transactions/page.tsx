"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { DataGrid, type DataGridCustomAction } from "@/components/data-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Loader2,
  Paperclip,
  BarChart3,
  FolderInput,
  Link2,
  Pencil,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { deleteTransactionsAction, updateTransactionAction } from "@/app/actions/transactions";
import { classifyTransactionsBatchAction, matchSubjectsBatchAction } from "@/app/actions/gemini";
import { TransactionDirectionBadge } from "@/components/transactions/TransactionDirectionBadge";
import { TransactionTotals } from "@/components/transactions/TransactionTotals";
import { TransactionForm } from "./_components/transaction-form";
import { ImportDialog } from "@/components/transactions/import/ImportDialog";
import { AccountPicker, type AccountNode } from "@/components/account-picker";
import { TransactionDashboard } from "@/components/transactions/TransactionDashboard";
import { useTranslation } from "@/lib/i18n/context";
import type {
  CollectionResource,
  TransactionDirection,
  TransactionAttachment,
} from "@/types/supabase";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

interface TransactionRow {
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
  subjects: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
    type: string;
  } | null;
  reclassification_nodes: {
    id: string;
    full_code: string;
    name: string;
  } | null;
  transaction_attachments: { id: string }[];
}

function getSubjectDisplayName(s: TransactionRow["subjects"]): string {
  if (!s) return "";
  if (s.type === "person") return `${s.last_name ?? ""} ${s.first_name ?? ""}`.trim();
  return s.business_name ?? "";
}

export default function TransactionsPage() {
  const { t, locale } = useTranslation();

  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [resources, setResources] = useState<CollectionResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [leafNodes, setLeafNodes] = useState<{ full_code: string; name: string; sign: "positive" | "negative"; id: string }[]>([]);
  const [accountNodes, setAccountNodes] = useState<AccountNode[]>([]);
  const [allSubjects, setAllSubjects] = useState<{ id: string; name: string }[]>([]);
  const [isClassifyingBulk, setIsClassifyingBulk] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  // Filters
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  // Form dialog
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [assignAccountOpen, setAssignAccountOpen] = useState(false);
  const [assignTargets, setAssignTargets] = useState<TransactionRow[]>([]);
  const [editingTx, setEditingTx] = useState<{
    id: string;
    collection_resource_id: string;
    subject_id: string | null;
    direction: TransactionDirection;
    amount: number;
    transaction_date: string;
    description: string;
    reference: string | null;
    is_balance_row: boolean;
    reclassification_node_id: string | null;
    transaction_attachments: TransactionAttachment[];
  } | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<TransactionRow[]>([]);

  const loadResources = useCallback(async (signal?: AbortSignal) => {
    try {
      const userRes = await fetch("/api/user-info", { signal });
      const userData = await userRes.json();
      const orgId = userData.profile?.organization_id;
      const roles: string[] = userData.roles ?? [];

      setCanWrite(roles.includes("accountant"));

      if (!orgId) {
        setLoading(false);
        return "";
      }

      const resRes = await fetch(`/api/collection-resources?orgId=${orgId}`, { signal });
      const resData = await resRes.json();
      const activeResources = (resData.resources ?? []).filter((r: CollectionResource) => r.is_active);
      setResources(activeResources);
      if (activeResources.length > 0) {
        setSelectedResourceId(activeResources[0].id);
      }

      // Load subjects for AI matching
      try {
        const subRes = await fetch(`/api/subjects?orgId=${orgId}`, { signal });
        const subData = await subRes.json();
        setAllSubjects(
          (subData.subjects ?? []).map((s: { id: string; first_name: string | null; last_name: string | null; business_name: string | null; type: string }) => ({
            id: s.id,
            name: s.type === "person" ? `${s.last_name ?? ""} ${s.first_name ?? ""}`.trim() : s.business_name ?? "",
          })).filter((s: { name: string }) => s.name)
        );
      } catch { /* ignore */ }

      // Load leaf nodes for AI classification
      try {
        const tmplRes = await fetch(`/api/reclassification-templates?orgId=${orgId}`, { signal });
        const tmplData = await tmplRes.json();
        const baseTmpl = (tmplData.templates ?? []).find((tmpl: { is_base: boolean; is_active: boolean }) => tmpl.is_base && tmpl.is_active);
        if (baseTmpl) {
          const nodesRes = await fetch(`/api/reclassification-nodes?templateId=${baseTmpl.id}`, { signal });
          const nodesData = await nodesRes.json();
          const allN = nodesData.nodes ?? [];
          const parentIds = new Set(allN.filter((n: { parent_id: string | null }) => n.parent_id).map((n: { parent_id: string }) => n.parent_id));
          setLeafNodes(
            allN
              .filter((n: { id: string; is_total?: boolean }) => !parentIds.has(n.id) && !n.is_total)
              .map((n: { id: string; full_code: string; name: string; sign: string }) => ({
                id: n.id, full_code: n.full_code, name: n.name, sign: n.sign as "positive" | "negative",
              }))
          );
          setAccountNodes(
            allN.map((n: { id: string; full_code: string; name: string; parent_id: string | null; sign?: string; is_total?: boolean }) => ({
              id: n.id, full_code: n.full_code, name: n.name, parent_id: n.parent_id,
              sign: n.sign as "positive" | "negative" | undefined, is_total: n.is_total,
            }))
          );
        }
      } catch { /* ignore */ }

      setLoading(false);
      return orgId;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "";
      toast.error(t("transactions.dataLoadError"));
      setLoading(false);
      return "";
    }
  }, [t]);

  const [orgId, setOrgId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    loadResources(controller.signal).then((id) => {
      if (id) setOrgId(id);
    });
    return () => controller.abort();
  }, [loadResources]);

  const loadTransactions = useCallback(async (signal?: AbortSignal) => {
    if (!orgId || !selectedResourceId) {
      setTransactions([]);
      return;
    }

    try {
      const params = new URLSearchParams({
        orgId,
        collectionResourceId: selectedResourceId,
      });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (directionFilter !== "all") params.set("direction", directionFilter);
      if (searchText) params.set("search", searchText);

      const res = await fetch(`/api/transactions?${params}`, { signal });
      const data = await res.json();
      setTransactions(data.transactions ?? []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(t("transactions.dataLoadError"));
    }
  }, [orgId, selectedResourceId, dateFrom, dateTo, directionFilter, searchText, t]);

  useEffect(() => {
    const controller = new AbortController();
    loadTransactions(controller.signal);
    return () => controller.abort();
  }, [loadTransactions]);

  // Calculate running balance (ASC order from API), then reverse for display (newest first)
  const transactionsWithBalance = useMemo(() => {
    let balance = 0;
    const withBalance = transactions.map((tx) => {
      const amt = Number(tx.amount);
      if (tx.is_balance_row) {
        balance = tx.direction === "in" ? amt : -amt;
      } else {
        balance += tx.direction === "in" ? amt : -amt;
      }
      return { ...tx, _balance: balance };
    });
    return withBalance.reverse();
  }, [transactions]);

  // Totals — exclude balance rows
  const totals = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const tx of transactions) {
      if (tx.is_balance_row) continue;
      if (tx.direction === "in") totalIn += Number(tx.amount);
      else totalOut += Number(tx.amount);
    }
    return { totalIn, totalOut };
  }, [transactions]);

  const fmtCurrency = useCallback(
    (v: number) =>
      v.toLocaleString(locale, {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
      }),
    [locale]
  );

  // --- Form dialog handlers ---

  const openNewForm = () => {
    setEditingTx(null);
    setFormDialogOpen(true);
  };

  const openEditForm = async (tx: TransactionRow) => {
    setFormLoading(true);
    setFormDialogOpen(true);
    try {
      const res = await fetch(`/api/transactions/${tx.id}`);
      if (res.ok) {
        const data = await res.json();
        setEditingTx(data.transaction);
      } else {
        toast.error(t("transactions.dataLoadError"));
        setFormDialogOpen(false);
      }
    } catch {
      toast.error(t("transactions.dataLoadError"));
      setFormDialogOpen(false);
    } finally {
      setFormLoading(false);
    }
  };

  const handleFormSuccess = () => {
    setFormDialogOpen(false);
    setEditingTx(null);
    loadTransactions();
  };

  const handleFormClose = () => {
    setFormDialogOpen(false);
    setEditingTx(null);
  };

  const handleDelete = async () => {
    if (deleteTargets.length === 0) return;
    const ids = deleteTargets.map((tx) => tx.id);
    const result = await deleteTransactionsAction(ids);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("transactions.deleted"));
    }
    setDeleteDialogOpen(false);
    setDeleteTargets([]);
    loadTransactions();
  };

  type TxRow = TransactionRow & { _balance: number };

  const balanceRowCellClass = (params: { data?: TxRow }) => {
    if (params.data?.is_balance_row) return "font-bold bg-blue-50 dark:bg-blue-900/20";
    return "";
  };

  const noAccountRowStyle = (params: { data?: TxRow }) => {
    if (params.data && !params.data.is_balance_row && !params.data.reclassification_nodes) {
      return { backgroundColor: "rgba(251, 191, 36, 0.08)" }; // amber tint
    }
    return undefined;
  };

  const columnDefs = useMemo<ColDef<TxRow>[]>(
    () => [
      {
        headerName: t("transactions.transactionDate"),
        field: "transaction_date",
        minWidth: 110,
        maxWidth: 120,
        filter: "agTextColumnFilter",
        cellClass: (params) => balanceRowCellClass(params),
        cellStyle: (params) => noAccountRowStyle(params),
        valueFormatter: (params) =>
          params.value ? new Date(params.value).toLocaleDateString(locale) : "",
      },
      {
        headerName: t("transactions.description"),
        field: "description",
        minWidth: 200,
        filter: "agTextColumnFilter",
        cellClass: (params) => balanceRowCellClass(params),
        cellStyle: (params) => noAccountRowStyle(params),
        cellRenderer: (params: ICellRendererParams<TxRow>) => {
          if (!params.data) return null;
          if (params.data.is_balance_row) {
            return (
              <div className="flex items-center gap-2 h-full font-bold">
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200">
                  {t("transactions.balanceRow").toUpperCase()}
                </span>
                <span>{params.data.description}</span>
              </div>
            );
          }
          return params.data.description;
        },
      },
      {
        headerName: t("transactions.subject"),
        valueGetter: (params) =>
          params.data ? getSubjectDisplayName(params.data.subjects) : "",
        minWidth: 150,
        filter: "agTextColumnFilter",
        cellClass: (params) => balanceRowCellClass(params),
        cellStyle: (params) => noAccountRowStyle(params),
      },
      {
        headerName: t("transactions.account"),
        valueGetter: (params) => {
          const node = params.data?.reclassification_nodes;
          return node ? `${node.full_code} ${node.name}` : "";
        },
        minWidth: 160,
        filter: "agTextColumnFilter",
        cellClass: (params) => balanceRowCellClass(params),
        cellStyle: (params) => noAccountRowStyle(params),
      },
      {
        headerName: t("transactions.directionIn"),
        minWidth: 120,
        maxWidth: 140,
        filter: "agNumberColumnFilter",
        cellStyle: (params) => noAccountRowStyle(params),
        valueGetter: (params) => {
          if (!params.data || params.data.is_balance_row) return null;
          return params.data.direction === "in" ? Number(params.data.amount) : null;
        },
        valueFormatter: (params) =>
          params.value != null ? fmtCurrency(params.value) : "",
        cellClass: "text-right text-green-600 dark:text-green-400",
      },
      {
        headerName: t("transactions.directionOut"),
        minWidth: 120,
        maxWidth: 140,
        filter: "agNumberColumnFilter",
        cellStyle: (params) => noAccountRowStyle(params),
        valueGetter: (params) => {
          if (!params.data || params.data.is_balance_row) return null;
          return params.data.direction === "out" ? Number(params.data.amount) : null;
        },
        valueFormatter: (params) =>
          params.value != null ? fmtCurrency(params.value) : "",
        cellClass: "text-right text-red-600 dark:text-red-400",
      },
      {
        headerName: t("transactions.balance"),
        minWidth: 130,
        maxWidth: 150,
        filter: "agNumberColumnFilter",
        sortable: false,
        cellStyle: (params) => noAccountRowStyle(params),
        valueGetter: (params) => params.data?._balance ?? 0,
        valueFormatter: (params) =>
          params.value != null ? fmtCurrency(params.value) : "",
        cellClassRules: {
          "text-right font-semibold text-green-600 dark:text-green-400": (params) =>
            (params.value ?? 0) >= 0,
          "text-right font-semibold text-red-600 dark:text-red-400": (params) =>
            (params.value ?? 0) < 0,
        },
      },
      {
        headerName: t("transactions.attachments"),
        minWidth: 80,
        maxWidth: 90,
        filter: false,
        sortable: false,
        cellStyle: (params) => noAccountRowStyle(params),
        cellRenderer: (params: ICellRendererParams<TxRow>) => {
          const count = params.data?.transaction_attachments?.length ?? 0;
          if (count === 0) return null;
          return (
            <div className="flex items-center justify-center h-full gap-1 text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" />
              <span className="text-xs">{count}</span>
            </div>
          );
        },
      },
    ],
    [t, locale, fmtCurrency]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6" />
          {t("transactions.title")}
        </h1>
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      {/* Header */}
      <div className="flex items-center gap-4 shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6" />
          {t("transactions.title")}
        </h1>
        <div className="flex-1" />
        {selectedResourceId && (
          <Button
            variant={showDashboard ? "default" : "outline"}
            size="sm"
            onClick={() => setShowDashboard((v) => !v)}
            className="cursor-pointer"
          >
            <BarChart3 className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
        )}
      </div>

      {/* Primary filter: collection resource */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 shrink-0">
        <Select
          value={selectedResourceId}
          onValueChange={(v) => setSelectedResourceId(v ?? "")}
        >
          <SelectTrigger className="sm:w-72">
            <SelectValue placeholder={t("transactions.selectResource")}>
              {selectedResourceId
                ? (() => {
                    const r = resources.find((r) => r.id === selectedResourceId);
                    return r ? `${r.name} (${r.code})` : selectedResourceId;
                  })()
                : t("transactions.selectResource")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {resources.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name} ({r.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedResourceId && (
          <>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={t("transactions.searchPlaceholder")}
                className="pl-8"
              />
            </div>
            <Select
              value={directionFilter}
              onValueChange={(v) => setDirectionFilter(v ?? "all")}
            >
              <SelectTrigger className="sm:w-44">
                <SelectValue>
                  {directionFilter === "all"
                    ? <span className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">{t("transactions.directionIn")}</span>
                        <span className="text-muted-foreground">-</span>
                        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs">{t("transactions.directionOut")}</span>
                      </span>
                    : directionFilter === "in"
                      ? <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{t("transactions.directionIn")}</span>
                      : <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{t("transactions.directionOut")}</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("transactions.allDirections")}</SelectItem>
                <SelectItem value="in"><span className="px-2 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{t("transactions.directionIn")}</span></SelectItem>
                <SelectItem value="out"><span className="px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{t("transactions.directionOut")}</span></SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {/* Date range filters */}
      {selectedResourceId && (
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 shrink-0 flex-wrap">
          {/* Period presets */}
          <div className="flex items-center gap-1">
            {([
              { label: t("transactions.thisMonth"), getRange: () => {
                const now = new Date();
                return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: "" };
              }},
              { label: t("transactions.thisQuarter"), getRange: () => {
                const now = new Date();
                const qStart = Math.floor(now.getMonth() / 3) * 3;
                return { from: `${now.getFullYear()}-${String(qStart + 1).padStart(2, "0")}-01`, to: "" };
              }},
              { label: t("transactions.thisYear"), getRange: () => {
                return { from: `${new Date().getFullYear()}-01-01`, to: "" };
              }},
            ] as const).map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                className="h-7 text-xs cursor-pointer"
                onClick={() => {
                  const { from, to } = preset.getRange();
                  setDateFrom(from);
                  setDateTo(to);
                }}
              >
                {preset.label}
              </Button>
            ))}
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs cursor-pointer"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
              >
                ✕
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t("transactions.dateFrom")}:
            </span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t("transactions.dateTo")}:
            </span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
          </div>
        </div>
      )}

      {/* Content */}
      {!selectedResourceId ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">{t("transactions.selectResourceFirst")}</p>
        </div>
      ) : (
        <>
          {/* Dashboard */}
          {showDashboard && (
            <TransactionDashboard
              orgId={orgId}
              collectionResourceId={selectedResourceId}
              locale={locale}
            />
          )}

          {/* Grid */}
          <DataGrid
            rowData={transactionsWithBalance}
            columnDefs={columnDefs}
            onCreate={canWrite ? openNewForm : undefined}
            onEdit={canWrite ? (tx) => openEditForm(tx) : undefined}
            onDelete={
              canWrite
                ? (selected) => {
                    setDeleteTargets(selected);
                    setDeleteDialogOpen(true);
                  }
                : undefined
            }
            exportFileName="movimenti"
            importItems={canWrite ? [
              { label: t("transactions.title"), onClick: () => setImportDialogOpen(true) },
            ] : undefined}
            customActions={canWrite && leafNodes.length > 0 ? [
              {
                label: t("transactions.assignAccount"),
                icon: isClassifyingBulk ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FolderInput className="h-4 w-4 mr-1" />,
                variant: "outline" as const,
                disabled: isClassifyingBulk,
                requiresSelection: true,
                children: [
                  {
                    label: t("transactions.assignAccountAuto"),
                    icon: <Sparkles className="h-3.5 w-3.5" />,
                    disabled: isClassifyingBulk,
                    onClick: async (selected) => {
                      const toClassify = selected.filter((tx) => !tx.is_balance_row && !tx.reclassification_nodes);
                      if (toClassify.length === 0) {
                        toast.info("Tutte le righe selezionate hanno già un conto");
                        return;
                      }
                      setIsClassifyingBulk(true);
                      const batchResult = await classifyTransactionsBatchAction(
                        toClassify.map((tx) => ({
                          id: tx.id,
                          description: [tx.description, tx.reference].filter(Boolean).join(" — ") || "",
                          direction: tx.direction,
                          amount: Number(tx.amount),
                        })),
                        leafNodes.map((n) => ({ full_code: n.full_code, name: n.name, sign: n.sign }))
                      );
                      if (!batchResult.success) {
                        toast.error(batchResult.error);
                        setIsClassifyingBulk(false);
                        return;
                      }
                      let classified = 0;
                      for (const tx of toClassify) {
                        const suggestion = batchResult.results[tx.id];
                        if (suggestion?.confident && suggestion.full_code) {
                          const matched = leafNodes.find((n) => n.full_code === suggestion.full_code);
                          if (matched) {
                            await updateTransactionAction(tx.id, {
                              collection_resource_id: tx.collection_resource_id,
                              direction: tx.direction,
                              amount: Number(tx.amount),
                              transaction_date: tx.transaction_date,
                              description: tx.description,
                              reference: tx.reference,
                              is_balance_row: tx.is_balance_row,
                              reclassification_node_id: matched.id,
                            });
                            classified++;
                          }
                        }
                      }
                      setIsClassifyingBulk(false);
                      if (classified > 0) {
                        toast.success(`${classified}/${toClassify.length} movimenti classificati`);
                        loadTransactions();
                      } else {
                        toast.info("L'AI non è riuscita a classificare i movimenti selezionati");
                      }
                    },
                  },
                  {
                    label: t("transactions.assignAccountManual"),
                    icon: <FolderInput className="h-3.5 w-3.5" />,
                    onClick: (selected) => {
                      setAssignTargets(selected.filter((tx) => !tx.is_balance_row));
                      setAssignAccountOpen(true);
                    },
                  },
                  {
                    label: t("transactions.matchSubjects"),
                    icon: <Link2 className="h-3.5 w-3.5" />,
                    disabled: allSubjects.length === 0,
                    onClick: async (selected) => {
                      const toMatch = selected.filter((tx) => !tx.is_balance_row && !tx.subjects);
                      if (toMatch.length === 0) {
                        toast.info(t("transactions.allHaveSubjects"));
                        return;
                      }
                      setIsClassifyingBulk(true);
                      const result = await matchSubjectsBatchAction(
                        toMatch.map((tx) => ({ id: tx.id, description: tx.description || "" })),
                        allSubjects
                      );
                      if (!result.success) {
                        toast.error(result.error);
                        setIsClassifyingBulk(false);
                        return;
                      }
                      let matched = 0;
                      for (const tx of toMatch) {
                        const suggestion = result.results[tx.id];
                        if (suggestion?.confident && suggestion.subject_id) {
                          await updateTransactionAction(tx.id, {
                            collection_resource_id: tx.collection_resource_id,
                            subject_id: suggestion.subject_id,
                            direction: tx.direction,
                            amount: Number(tx.amount),
                            transaction_date: tx.transaction_date,
                            description: tx.description,
                            reference: tx.reference,
                            is_balance_row: tx.is_balance_row,
                            reclassification_node_id: tx.reclassification_node_id,
                          });
                          matched++;
                        }
                      }
                      setIsClassifyingBulk(false);
                      if (matched > 0) {
                        toast.success(`${matched}/${toMatch.length} soggetti associati`);
                        loadTransactions();
                      } else {
                        toast.info(t("transactions.noSubjectsMatched"));
                      }
                    },
                  },
                ],
              },
            ] : undefined}
            renderMobileCard={(tx) => (
              <div key={tx.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {new Date(tx.transaction_date).toLocaleDateString(locale)}
                  </span>
                  <TransactionDirectionBadge direction={tx.direction} />
                </div>
                <p className="font-medium text-sm">{tx.description}</p>
                {tx.subjects && (
                  <p className="text-sm text-muted-foreground">
                    {getSubjectDisplayName(tx.subjects)}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span
                    className={`font-semibold ${
                      tx.direction === "in"
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {tx.direction === "in" ? "+" : "-"}
                    {fmtCurrency(Number(tx.amount))}
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      tx._balance >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {t("transactions.balance")}: {fmtCurrency(tx._balance)}
                  </span>
                </div>
                {tx.transaction_attachments.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Paperclip className="h-3 w-3" />
                    {tx.transaction_attachments.length} {t("transactions.attachments").toLowerCase()}
                  </div>
                )}
                {canWrite && (
                  <div className="flex gap-1.5 items-center pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEditForm(tx)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      {t("common.edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setDeleteTargets([tx]);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          />

          {/* Totals */}
          {transactions.length > 0 && (
            <TransactionTotals
              totalIn={totals.totalIn}
              totalOut={totals.totalOut}
              locale={locale}
            />
          )}
        </>
      )}

      {/* Form dialog (new / edit) */}
      <Dialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleFormClose();
        }}
      >
        <DialogContent
          className="sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>
              {editingTx
                ? t("transactions.editTransaction")
                : t("transactions.newTransaction")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editingTx
                ? t("transactions.editTransaction")
                : t("transactions.newTransaction")}
            </DialogDescription>
          </DialogHeader>
          {formLoading ? (
            <p className="text-muted-foreground text-center py-8">
              {t("common.loading")}
            </p>
          ) : (
            <TransactionForm
              key={editingTx?.id ?? "new"}
              transactionId={editingTx?.id}
              initialData={
                editingTx
                  ? {
                      collection_resource_id: editingTx.collection_resource_id,
                      subject_id: editingTx.subject_id,
                      direction: editingTx.direction,
                      amount: Number(editingTx.amount),
                      transaction_date: editingTx.transaction_date,
                      description: editingTx.description,
                      reference: editingTx.reference,
                      is_balance_row: editingTx.is_balance_row,
                      reclassification_node_id: editingTx.reclassification_node_id,
                      transaction_attachments: editingTx.transaction_attachments,
                    }
                  : undefined
              }
              defaultResourceId={selectedResourceId}
              onSuccess={handleFormSuccess}
              onClose={handleFormClose}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("transactions.confirmDelete")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("transactions.confirmDeleteDesc")}
            {deleteTargets.length > 1 && ` (${deleteTargets.length})`}
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        defaultResourceId={selectedResourceId}
        resources={resources}
        onComplete={() => loadTransactions()}
      />

      {/* Assign account dialog */}
      <Dialog open={assignAccountOpen} onOpenChange={setAssignAccountOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("transactions.assignAccountToSelected")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("transactions.assignAccountToSelected")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {assignTargets.length} {t("common.rows")}
            </p>
            <AccountPicker
              nodes={accountNodes}
              value=""
              onChange={async (nodeId) => {
                if (!nodeId) return;
                for (const tx of assignTargets) {
                  await updateTransactionAction(tx.id, {
                    collection_resource_id: tx.collection_resource_id,
                    direction: tx.direction,
                    amount: Number(tx.amount),
                    transaction_date: tx.transaction_date,
                    description: tx.description,
                    reference: tx.reference,
                    is_balance_row: tx.is_balance_row,
                    reclassification_node_id: nodeId,
                  });
                }
                toast.success(t("transactions.accountAssigned").replace("{count}", String(assignTargets.length)));
                setAssignAccountOpen(false);
                setAssignTargets([]);
                loadTransactions();
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
