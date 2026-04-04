"use client";

import { useEffect, useState, useCallback } from "react";
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
import { CreditCard, Pencil, Save, Trash2, X, Power, PowerOff, Eye, EyeOff } from "lucide-react";
import {
  createPaymentTypeAction,
  updatePaymentTypeAction,
  deletePaymentTypeAction,
  togglePaymentTypeActiveAction,
  seedPaymentTypesAction,
} from "@/app/actions/payment-types";
import type { PaymentType } from "@/types/supabase";
import { useTranslation } from "@/lib/i18n/context";

function toSnakeCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

interface Props {
  orgId: string;
}

export function PaymentTypesSection({ orgId }: Props) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentType | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<PaymentType | null>(null);

  // Filter state
  const [showDeactivated, setShowDeactivated] = useState(false);

  const loadData = useCallback(async () => {
    const params = new URLSearchParams({ orgId });
    if (showDeactivated) params.set("includeDeactivated", "true");
    const res = await fetch(`/api/payment-types?${params}`);
    const data = await res.json();
    setPaymentTypes(data.paymentTypes ?? []);
    setLoading(false);
  }, [orgId, showDeactivated]);

  useEffect(() => { loadData(); }, [loadData]);

  function openCreate() {
    setEditing(null);
    setFormName("");
    setFormCode("");
    setCodeManuallyEdited(false);
    setFormOpen(true);
  }

  function openEdit(pt: PaymentType) {
    setEditing(pt);
    setFormName(pt.name);
    setFormCode(pt.code);
    setCodeManuallyEdited(true);
    setFormOpen(true);
  }

  function handleNameChange(value: string) {
    setFormName(value);
    if (!codeManuallyEdited) {
      setFormCode(toSnakeCase(value));
    }
  }

  function handleCodeChange(value: string) {
    setFormCode(value);
    setCodeManuallyEdited(true);
  }

  async function handleSave() {
    setIsSubmitting(true);
    const data = { name: formName, code: formCode };

    if (editing) {
      const result = await updatePaymentTypeAction(editing.id, data);
      if (result.error) { toast.error(result.error); }
      else { toast.success(t("settings.paymentTypes.updated")); setFormOpen(false); loadData(); }
    } else {
      const result = await createPaymentTypeAction(data);
      if (result.error) { toast.error(result.error); }
      else { toast.success(t("settings.paymentTypes.created")); setFormOpen(false); loadData(); }
    }
    setIsSubmitting(false);
  }

  async function handleToggleActive(pt: PaymentType) {
    setIsSubmitting(true);
    const result = await togglePaymentTypeActiveAction(pt.id);
    if (result.error) { toast.error(result.error); }
    else {
      toast.success(result.is_active
        ? t("settings.paymentTypes.reactivated")
        : t("settings.paymentTypes.deactivatedMsg"));
      loadData();
    }
    setIsSubmitting(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    const result = await deletePaymentTypeAction(deleteTarget.id);
    if (result.error) { toast.error(result.error); }
    else { toast.success(t("settings.paymentTypes.deleted")); setDeleteTarget(null); loadData(); }
    setIsSubmitting(false);
  }

  const isSaveDisabled = isSubmitting || !formName.trim() || !formCode.trim();

  if (loading) {
    return <p className="text-muted-foreground text-center py-8">{t("common.loading")}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t("settings.paymentTypes.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("settings.paymentTypes.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showDeactivated ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowDeactivated(!showDeactivated)}
            title={showDeactivated ? t("settings.paymentTypes.hideDeactivated") : t("settings.paymentTypes.showDeactivated")}
          >
            {showDeactivated ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {t("settings.paymentTypes.deactivated")}
          </Button>
          <Button size="sm" onClick={openCreate}>
            {t("settings.paymentTypes.newType")}
          </Button>
        </div>
      </div>

      {paymentTypes.length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <p className="text-muted-foreground">{t("settings.paymentTypes.noTypesConfigured")}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={isSubmitting}
            onClick={async () => {
              setIsSubmitting(true);
              const result = await seedPaymentTypesAction();
              if (result.error) {
                toast.error(result.error);
              } else {
                toast.success(t("settings.paymentTypes.seedLoaded"));
                loadData();
              }
              setIsSubmitting(false);
            }}
          >
            <CreditCard className="h-4 w-4 mr-1" />
            {t("settings.paymentTypes.seedDefault")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {paymentTypes.map((pt) => (
            <div
              key={pt.id}
              className={`flex items-center justify-between gap-3 rounded-lg border border-l-4 border-l-indigo-500 px-4 py-3 ${!pt.is_active ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono font-bold text-sm bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded shrink-0">{pt.code}</span>
                <div className="min-w-0">
                  <span className="font-medium text-sm block truncate">{pt.name}</span>
                  {!pt.is_active && (
                    <span className="text-xs text-muted-foreground">
                      {t("settings.paymentTypes.deactivated")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(pt)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleToggleActive(pt)}
                  disabled={isSubmitting}
                  title={pt.is_active ? t("common.deactivate") : t("common.reactivate")}
                >
                  {pt.is_active
                    ? <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
                    : <Power className="h-3.5 w-3.5 text-green-600" />
                  }
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(pt)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? t("settings.paymentTypes.editType") : t("settings.paymentTypes.newTypeTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ptName">{t("settings.paymentTypes.name")}</Label>
                <Input
                  id="ptName"
                  value={formName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={t("settings.paymentTypes.namePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ptCode">{t("settings.paymentTypes.code")}</Label>
                <Input
                  id="ptCode"
                  value={formCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder={t("settings.paymentTypes.codePlaceholder")}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={isSaveDisabled}>
              <Save className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.saving") : editing ? t("common.update") : t("common.create")}
            </Button>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4 mr-1" />
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.paymentTypes.confirmDelete")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("settings.paymentTypes.confirmDeleteDesc")} <strong>{deleteTarget?.name} ({deleteTarget?.code})</strong>?
          </p>
          <DialogFooter>
            <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
              <Trash2 className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.deleting") : t("common.delete")}
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
