"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import {
  createTransactionAction,
  updateTransactionAction,
  type TransactionInput,
} from "@/app/actions/transactions";
import { TransactionAttachments } from "@/components/transactions/TransactionAttachments";
import { classifyTransactionAction } from "@/app/actions/gemini";
import { useTranslation } from "@/lib/i18n/context";
import type {
  CollectionResource,
  TransactionDirection,
  TransactionAttachment,
} from "@/types/supabase";

import { SubjectPicker, type SubjectPickerOption } from "@/components/subject-picker";
import { AccountPicker, type AccountNode } from "@/components/account-picker";

type SubjectOption = SubjectPickerOption;

interface TransactionFormProps {
  transactionId?: string;
  initialData?: {
    collection_resource_id: string;
    subject_id: string | null;
    direction: TransactionDirection;
    amount: number;
    transaction_date: string;
    description: string;
    reference: string | null;
    is_balance_row?: boolean;
    reclassification_node_id?: string | null;
    transaction_attachments?: TransactionAttachment[];
  };
  defaultResourceId?: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

function getSubjectLabel(s: SubjectOption): string {
  if (s.type === "person") return `${s.last_name ?? ""} ${s.first_name ?? ""}`.trim();
  return s.business_name ?? "";
}

export function TransactionForm({
  transactionId,
  initialData,
  defaultResourceId,
  onSuccess,
  onClose,
}: TransactionFormProps) {
  const { t } = useTranslation();
  const isEdit = !!transactionId;

  const [resources, setResources] = useState<CollectionResource[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [accountNodes, setAccountNodes] = useState<AccountNode[]>([]);
  const [attachments, setAttachments] = useState<TransactionAttachment[]>(
    initialData?.transaction_attachments ?? []
  );

  // Form state
  const [resourceId, setResourceId] = useState(
    initialData?.collection_resource_id ?? defaultResourceId ?? ""
  );
  const [direction, setDirection] = useState<TransactionDirection>(
    initialData?.direction ?? "in"
  );
  const [amount, setAmount] = useState(
    initialData?.amount ? String(initialData.amount) : ""
  );
  const [transactionDate, setTransactionDate] = useState(
    initialData?.transaction_date ?? new Date().toISOString().split("T")[0]
  );
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [reference, setReference] = useState(initialData?.reference ?? "");
  const [subjectId, setSubjectId] = useState(initialData?.subject_id ?? "");
  const [isBalanceRow, setIsBalanceRow] = useState(initialData?.is_balance_row ?? false);
  const [nodeId, setNodeId] = useState(initialData?.reclassification_node_id ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [orgId, setOrgId] = useState("");

  // Load resources and subjects
  useEffect(() => {
    const load = async () => {
      try {
        const userRes = await fetch("/api/user-info");
        const userData = await userRes.json();
        const oid = userData.profile?.organization_id;
        if (!oid) return;
        setOrgId(oid);

        const [resRes, subRes, tmplRes] = await Promise.all([
          fetch(`/api/collection-resources?orgId=${oid}`),
          fetch(`/api/subjects?orgId=${oid}`),
          fetch(`/api/reclassification-templates?orgId=${oid}`),
        ]);
        const resData = await resRes.json();
        const subData = await subRes.json();
        const tmplData = await tmplRes.json();

        setResources(
          (resData.resources ?? []).filter((r: CollectionResource) => r.is_active)
        );
        setSubjects(subData.subjects ?? []);

        // Find base template and load all nodes for tree picker
        const baseTemplate = (tmplData.templates ?? []).find(
          (tmpl: { is_base: boolean; is_active: boolean }) => tmpl.is_base && tmpl.is_active
        );
        if (baseTemplate) {
          const nodesRes = await fetch(`/api/reclassification-nodes?templateId=${baseTemplate.id}`);
          const nodesData = await nodesRes.json();
          setAccountNodes(
            (nodesData.nodes ?? []).map((n: AccountNode & { sign?: string; is_total?: boolean }) => ({
              id: n.id,
              full_code: n.full_code,
              name: n.name,
              parent_id: n.parent_id,
              sign: n.sign as "positive" | "negative" | undefined,
              is_total: n.is_total,
            }))
          );
        }
      } catch {
        toast.error(t("transactions.dataLoadError"));
      }
    };
    load();
  }, [t]);

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error(t("transactions.amount") + " > 0");
      return;
    }

    const finalDescription = isBalanceRow
      ? `${t("transactions.balanceAt")} ${transactionDate}`
      : description;

    const input: TransactionInput = {
      collection_resource_id: resourceId,
      subject_id: isBalanceRow ? null : (subjectId || null),
      direction,
      amount: parsedAmount,
      transaction_date: transactionDate,
      description: finalDescription,
      reference: isBalanceRow ? null : (reference || null),
      is_balance_row: isBalanceRow,
      reclassification_node_id: isBalanceRow ? null : (nodeId || null),
    };

    setIsSubmitting(true);
    const result = isEdit
      ? await updateTransactionAction(transactionId!, input)
      : await createTransactionAction(input);

    if (result.error) {
      toast.error(result.error);
      setIsSubmitting(false);
    } else {
      toast.success(isEdit ? t("transactions.updated") : t("transactions.created"));
      onSuccess?.();
    }
  };

  const reloadAttachments = useCallback(async () => {
    if (!transactionId) return;
    try {
      const res = await fetch(
        `/api/transactions?orgId=${orgId}&collectionResourceId=${resourceId}`
      );
      const data = await res.json();
      const tx = (data.transactions ?? []).find(
        (t: { id: string }) => t.id === transactionId
      );
      if (tx?.transaction_attachments) {
        setAttachments(tx.transaction_attachments);
      }
    } catch {
      // ignore
    }
  }, [transactionId, orgId, resourceId]);

  const isSaveDisabled =
    isSubmitting || !resourceId || !amount || !transactionDate || (!isBalanceRow && !description.trim());

  return (
    <div className="space-y-5">
      {/* Balance row toggle */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isBalanceRow}
          onChange={(e) => setIsBalanceRow(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <span className="text-sm font-medium">{t("transactions.balanceRow")}</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("transactions.collectionResource")} *</Label>
          <Select value={resourceId} onValueChange={(v) => setResourceId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder={t("transactions.selectResource")}>
                {resourceId
                  ? (() => {
                      const r = resources.find((r) => r.id === resourceId);
                      return r ? `${r.name} (${r.code})` : resourceId;
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
        </div>

        <div className="space-y-2">
          <Label>{t("transactions.direction")} *</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={direction === "in" ? "default" : "outline"}
              className={
                direction === "in"
                  ? "flex-1 bg-green-600 hover:bg-green-700 text-white"
                  : "flex-1"
              }
              onClick={() => setDirection("in")}
            >
              {isBalanceRow ? t("transactions.positiveBalance") : t("transactions.directionIn")}
            </Button>
            <Button
              type="button"
              variant={direction === "out" ? "default" : "outline"}
              className={
                direction === "out"
                  ? "flex-1 bg-red-600 hover:bg-red-700 text-white"
                  : "flex-1"
              }
              onClick={() => setDirection("out")}
            >
              {isBalanceRow ? t("transactions.negativeBalance") : t("transactions.directionOut")}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("transactions.amount")} (€) *</Label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("transactions.transactionDate")} *</Label>
          <Input
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
          />
        </div>
      </div>

      {!isBalanceRow && (
        <>
          <div className="space-y-2">
            <Label>{t("transactions.description")} *</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("transactions.descriptionPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("transactions.reference")}</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t("transactions.referencePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("transactions.subject")}</Label>
              <SubjectPicker
                subjects={subjects}
                value={subjectId}
                onChange={setSubjectId}
              />
            </div>
          </div>
        </>
      )}

      {/* Account (reclassification node) */}
      {!isBalanceRow && accountNodes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t("transactions.account")}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isClassifying || !description.trim()}
              className="h-6 text-xs gap-1"
              onClick={async () => {
                setIsClassifying(true);
                const leafNodes = accountNodes
                  .filter((n) => {
                    const parentIds = new Set(accountNodes.filter((x) => x.parent_id).map((x) => x.parent_id));
                    return !parentIds.has(n.id) && !n.is_total;
                  })
                  .map((n) => ({
                    full_code: n.full_code,
                    name: n.name,
                    sign: (n.sign ?? "positive") as "positive" | "negative",
                  }));
                const result = await classifyTransactionAction(
                  [description, reference].filter(Boolean).join(" — ") || "",
                  direction,
                  parseFloat(amount) || 0,
                  leafNodes
                );
                setIsClassifying(false);
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                if (!result.confident || !result.full_code) {
                  setNodeId("");
                  toast.info(t("transactions.aiUncertain"));
                  return;
                }
                const matched = accountNodes.find((n) => n.full_code === result.full_code);
                if (matched) {
                  setNodeId(matched.id);
                } else {
                  setNodeId("");
                  toast.info(t("transactions.aiUncertain"));
                }
              }}
            >
              {isClassifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              AI
            </Button>
          </div>
          <AccountPicker
            nodes={accountNodes}
            value={nodeId}
            onChange={setNodeId}
          />
        </div>
      )}

      {/* Attachments (only in edit mode) */}
      {isEdit && transactionId && (
        <TransactionAttachments
          transactionId={transactionId}
          attachments={attachments}
          canEdit={true}
          onUpdate={reloadAttachments}
        />
      )}

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => onClose?.()}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSubmit} disabled={isSaveDisabled}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
