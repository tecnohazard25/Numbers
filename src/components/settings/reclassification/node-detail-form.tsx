"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n/context";
import {
  updateNodeAction,
  deleteNodeAction,
  updateNodeRefsAction,
} from "@/app/actions/reclassification";
import type {
  ReclassificationNode,
  ReclassificationNodeSign,
  ReclassificationNodeRef,
} from "@/types/supabase";

interface NodeDetailFormProps {
  node: ReclassificationNode;
  allNodes: ReclassificationNode[];
  baseNodes?: ReclassificationNode[];
  nodeRefs: ReclassificationNodeRef[];
  isAccountant: boolean;
  onNodeUpdated: () => void;
  onNodeDeleted: () => void;
}

export function NodeDetailForm({
  node,
  allNodes,
  baseNodes = [],
  nodeRefs,
  isAccountant,
  onNodeUpdated,
  onNodeDeleted,
}: NodeDetailFormProps) {
  const { t } = useTranslation();

  // Fields
  const [code, setCode] = useState(node.code);
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(node.description ?? "");
  const [sign, setSign] = useState<ReclassificationNodeSign>(node.sign);
  const [isTotal, setIsTotal] = useState(node.is_total);
  const [formula, setFormula] = useState(node.formula ?? "");
  const [useCustomFormula, setUseCustomFormula] = useState(!!node.formula);

  // Refs (for auto-sum)
  const [selectedRefIds, setSelectedRefIds] = useState<Set<string>>(new Set());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Stable key for refs to detect changes
  const refsKey = nodeRefs
    .filter((r) => r.total_node_id === node.id)
    .map((r) => r.ref_node_id)
    .sort()
    .join(",");

  // Reset on node change or refs change
  useEffect(() => {
    setCode(node.code);
    setName(node.name);
    setDescription(node.description ?? "");
    setSign(node.sign);
    setIsTotal(node.is_total);
    setFormula(node.formula ?? "");
    setUseCustomFormula(!!node.formula);
    const refs = nodeRefs
      .filter((r) => r.total_node_id === node.id)
      .map((r) => r.ref_node_id);
    setSelectedRefIds(new Set(refs));
    setRefSearch("");
  }, [node.id, node.code, node.name, node.description, node.sign, node.is_total, node.formula, refsKey]);

  const hasChanges =
    code !== node.code ||
    name !== node.name ||
    description !== (node.description ?? "") ||
    sign !== node.sign ||
    isTotal !== node.is_total ||
    (useCustomFormula ? formula !== (node.formula ?? "") : false);

  // Check if refs changed
  const refsChanged = (() => {
    if (!isTotal) return false;
    const savedRefIds = nodeRefs
      .filter((r) => r.total_node_id === node.id)
      .map((r) => r.ref_node_id);
    const savedSet = new Set(savedRefIds);
    if (selectedRefIds.size !== savedSet.size) return true;
    for (const id of selectedRefIds) {
      if (!savedSet.has(id)) return true;
    }
    return false;
  })();

  const canSave = hasChanges || refsChanged;

  // Candidate nodes for refs:
  // - Base schema: root nodes from same template
  // - Non-base schema: root nodes from the base schema
  const isNonBase = baseNodes.length > 0;
  const refCandidates = isNonBase
    ? baseNodes
        .filter((n) => n.parent_id === null)
        .sort((a, b) => a.full_code.localeCompare(b.full_code, undefined, { numeric: true }))
    : allNodes
        .filter((n) => n.parent_id === null && n.id !== node.id && n.template_id === node.template_id)
        .sort((a, b) => a.full_code.localeCompare(b.full_code, undefined, { numeric: true }));

  const [refSearch, setRefSearch] = useState("");
  const filteredRefCandidates = refCandidates.filter((n) => {
    if (!refSearch.trim()) return true;
    const q = refSearch.toLowerCase();
    return n.full_code.toLowerCase().includes(q) || n.name.toLowerCase().includes(q);
  });


  function toggleRef(refId: string) {
    setSelectedRefIds((prev) => {
      const next = new Set(prev);
      if (next.has(refId)) next.delete(refId);
      else next.add(refId);
      return next;
    });
  }

  async function handleSave() {
    setIsSubmitting(true);

    // Save node fields
    const result = await updateNodeAction(node.id, {
      code,
      name,
      description: description || null,
      sign,
      isTotal,
      formula: useCustomFormula && isTotal ? formula : null,
    });

    if ("error" in result) {
      toast.error(result.error);
      setIsSubmitting(false);
      return;
    }

    // Save refs if total
    if (isTotal && !useCustomFormula) {
      const refsResult = await updateNodeRefsAction(node.id, [...selectedRefIds]);
      if ("error" in refsResult) {
        toast.error(refsResult.error);
        setIsSubmitting(false);
        return;
      }
    } else if (isTotal && useCustomFormula) {
      // Clear refs when using custom formula
      await updateNodeRefsAction(node.id, []);
    }

    setIsSubmitting(false);
    toast.success(t("reclassification.node.updated"));
    onNodeUpdated();
  }

  async function handleDelete() {
    setIsSubmitting(true);
    const result = await deleteNodeAction(node.id);
    setIsSubmitting(false);
    if ("error" in result) { toast.error(result.error); return; }
    toast.success(t("reclassification.node.deleted"));
    setShowDeleteDialog(false);
    onNodeDeleted();
  }

  return (
    <div className="space-y-4">
      {/* Full code badge */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="font-mono text-xs">
          {node.full_code}
        </Badge>
        {node.is_total && (
          <Badge variant="outline" className="text-xs">
            {t("reclassification.node.isTotal")}
          </Badge>
        )}
      </div>

      {/* Identity card */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("reclassification.node.identity")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("reclassification.node.code")}</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("reclassification.node.codePlaceholder")}
                disabled={!isAccountant}
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("reclassification.node.name")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("reclassification.node.namePlaceholder")}
                disabled={!isAccountant}
              />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <Label className="text-xs">{t("reclassification.node.description")}</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("reclassification.node.descriptionPlaceholder")}
              disabled={!isAccountant}
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </CardContent>
      </Card>

      {/* Configuration card — hidden for non-base schemas (no config needed, all totals) */}
      {!isNonBase && (
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("reclassification.node.configuration")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Sign — only for root non-total nodes of base schemas */}
            {!node.parent_id && !isTotal && !isNonBase && (
              <div className="space-y-1">
                <Label className="text-xs">{t("reclassification.node.sign")}</Label>
                <Select
                  value={sign}
                  onValueChange={(v) => { if (v) setSign(v as ReclassificationNodeSign); }}
                  disabled={!isAccountant}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {sign === "positive"
                        ? t("reclassification.node.positive")
                        : t("reclassification.node.negative")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positive">{t("reclassification.node.positive")}</SelectItem>
                    <SelectItem value="negative">{t("reclassification.node.negative")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Is Total toggle — hidden for non-base schemas (always total) */}
            {isAccountant && !isNonBase && (
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_total"
                  checked={isTotal}
                  onChange={(e) => setIsTotal(e.target.checked)}
                  className="rounded border-input h-4 w-4"
                />
                <div>
                  <Label htmlFor="is_total" className="text-sm font-medium">
                    {t("reclassification.node.isTotal")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("reclassification.node.isTotalDesc")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Formula card — only when is_total (always shown for non-base schemas) */}
      {(isTotal || isNonBase) && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("reclassification.node.formulaCard")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Toggle: auto-sum vs custom formula */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="formula_mode"
                    checked={!useCustomFormula}
                    onChange={() => setUseCustomFormula(false)}
                    disabled={!isAccountant}
                    className="h-4 w-4"
                  />
                  {t("reclassification.node.autoSum")}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="formula_mode"
                    checked={useCustomFormula}
                    onChange={() => setUseCustomFormula(true)}
                    disabled={!isAccountant}
                    className="h-4 w-4"
                  />
                  {t("reclassification.node.customFormula")}
                </label>
              </div>

              {!useCustomFormula ? (
                /* Checkbox list of nodes to reference */
                <div className="space-y-1.5">
                  <Input
                    value={refSearch}
                    onChange={(e) => setRefSearch(e.target.value)}
                    placeholder={t("common.search")}
                    className="h-7 text-xs"
                  />
                  <div className="max-h-48 overflow-auto space-y-1 rounded border p-2">
                    {filteredRefCandidates.map((n) => (
                      <label
                        key={n.id}
                        className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedRefIds.has(n.id)}
                          onChange={() => toggleRef(n.id)}
                          disabled={!isAccountant}
                          className="rounded border-input h-3.5 w-3.5"
                        />
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          {n.full_code}
                        </span>
                        <span className="truncate">{n.name}</span>
                        <span className={`ml-auto text-xs ${n.sign === "positive" ? "text-emerald-600" : "text-red-600"}`}>
                          {n.sign === "positive" ? "+" : "−"}
                        </span>
                      </label>
                    ))}
                    {filteredRefCandidates.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        {t("common.noData")}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* Custom formula text input */
                <div className="space-y-1">
                  <Input
                    value={formula}
                    onChange={(e) => setFormula(e.target.value)}
                    placeholder={t("reclassification.node.formulaPlaceholder")}
                    disabled={!isAccountant}
                    className="font-mono text-sm"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation warnings */}
      {isTotal && !useCustomFormula && selectedRefIds.size === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t("reclassification.node.warningNoRefs")}
        </p>
      )}

      {/* Action bar */}
      {isAccountant && (
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={isSubmitting || !canSave || !code.trim() || !name.trim()}
            size="sm"
          >
            {isSubmitting ? t("common.saving") : t("reclassification.node.saveChanges")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {t("common.delete")}
          </Button>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reclassification.node.confirmDelete")}</DialogTitle>
          </DialogHeader>
          <p>{t("reclassification.node.confirmDeleteDesc").replace("{name}", node.name)}</p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t("common.cancel")}</DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
              {isSubmitting ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
