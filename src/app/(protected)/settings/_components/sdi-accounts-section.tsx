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
import { FileText, Pencil, Save, Trash2, X, Power, PowerOff, Eye, EyeOff } from "lucide-react";
import {
  createSdiAccountAction,
  updateSdiAccountAction,
  deleteSdiAccountAction,
  toggleSdiAccountActiveAction,
} from "@/app/actions/sdi-accounts";
import type { SdiAccount } from "@/types/supabase";
import { useTranslation } from "@/lib/i18n/context";

interface Props {
  orgId: string;
}

export function SdiAccountsSection({ orgId }: Props) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<SdiAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SdiAccount | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formPec, setFormPec] = useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<SdiAccount | null>(null);

  // Filter state
  const [showDeactivated, setShowDeactivated] = useState(false);

  const loadData = useCallback(async () => {
    const params = new URLSearchParams({ orgId });
    if (showDeactivated) params.set("includeDeactivated", "true");
    const res = await fetch(`/api/sdi-accounts?${params}`);
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setLoading(false);
  }, [orgId, showDeactivated]);

  useEffect(() => { loadData(); }, [loadData]);

  function openCreate() {
    setEditing(null);
    setFormName(""); setFormCode(""); setFormPec("");
    setFormOpen(true);
  }

  function openEdit(acc: SdiAccount) {
    setEditing(acc);
    setFormName(acc.name); setFormCode(acc.code); setFormPec(acc.pec ?? "");
    setFormOpen(true);
  }

  async function handleSave() {
    setIsSubmitting(true);
    const data = {
      name: formName,
      code: formCode,
      pec: formPec || null,
    };

    if (editing) {
      const result = await updateSdiAccountAction(editing.id, data);
      if (result.error) { toast.error(result.error); }
      else { toast.success(t("settings.sdiAccounts.updated")); setFormOpen(false); loadData(); }
    } else {
      const result = await createSdiAccountAction(data);
      if (result.error) { toast.error(result.error); }
      else { toast.success(t("settings.sdiAccounts.created")); setFormOpen(false); loadData(); }
    }
    setIsSubmitting(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    const result = await deleteSdiAccountAction(deleteTarget.id);
    if (result.error) { toast.error(result.error); }
    else { toast.success(t("settings.sdiAccounts.deleted")); setDeleteTarget(null); loadData(); }
    setIsSubmitting(false);
  }

  async function handleToggleActive(acc: SdiAccount) {
    setIsSubmitting(true);
    const result = await toggleSdiAccountActiveAction(acc.id);
    if (result.error) { toast.error(result.error); }
    else {
      toast.success(result.is_active
        ? t("common.reactivate")
        : t("settings.sdiAccounts.deactivated"));
      loadData();
    }
    setIsSubmitting(false);
  }

  const isSaveDisabled = isSubmitting || !formName.trim() || !formCode.trim() || formCode.trim().length !== 7;

  if (loading) {
    return <p className="text-muted-foreground text-center py-8">{t("common.loading")}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("settings.sdiAccounts.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("settings.sdiAccounts.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showDeactivated ? "secondary" : "outline"}
            size="sm"
            className="cursor-pointer"
            onClick={() => setShowDeactivated(!showDeactivated)}
            title={showDeactivated ? t("settings.paymentTypes.hideDeactivated") : t("settings.paymentTypes.showDeactivated")}
          >
            {showDeactivated ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {t("settings.sdiAccounts.deactivated")}
          </Button>
          <Button size="sm" className="cursor-pointer" onClick={openCreate}>
            {t("settings.sdiAccounts.newAccount")}
          </Button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">{t("settings.sdiAccounts.noAccountsConfigured")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className={`flex items-center justify-between gap-3 rounded-lg border border-l-4 border-l-cyan-500 px-4 py-3 ${!acc.is_active ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono font-bold text-sm bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded shrink-0">{acc.code}</span>
                <div className="min-w-0">
                  <span className="font-medium text-sm block truncate">{acc.name}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-2">
                    {acc.pec && <span>{acc.pec}</span>}
                    {!acc.is_active && <span> — {t("settings.sdiAccounts.deactivated")}</span>}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon-sm" className="cursor-pointer" onClick={() => openEdit(acc)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="cursor-pointer"
                  onClick={() => handleToggleActive(acc)}
                  disabled={isSubmitting}
                  title={acc.is_active ? t("common.deactivate") : t("common.reactivate")}
                >
                  {acc.is_active
                    ? <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
                    : <Power className="h-3.5 w-3.5 text-green-600" />
                  }
                </Button>
                <Button variant="ghost" size="icon-sm" className="cursor-pointer" onClick={() => setDeleteTarget(acc)}>
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
              {editing ? t("settings.sdiAccounts.editAccount") : t("settings.sdiAccounts.newAccountTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sdiName">{t("settings.sdiAccounts.name")}</Label>
                <Input id="sdiName" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={t("settings.sdiAccounts.namePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sdiCode">{t("settings.sdiAccounts.code")}</Label>
                <Input id="sdiCode" value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder={t("settings.sdiAccounts.codePlaceholder")} maxLength={7} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sdiPec">{t("settings.sdiAccounts.pec")} ({t("common.optional")})</Label>
              <Input id="sdiPec" value={formPec} onChange={(e) => setFormPec(e.target.value)} placeholder={t("settings.sdiAccounts.pecPlaceholder")} type="email" />
            </div>
          </div>
          <DialogFooter>
            <Button className="cursor-pointer" onClick={handleSave} disabled={isSaveDisabled}>
              <Save className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.saving") : editing ? t("common.update") : t("common.create")}
            </Button>
            <Button variant="outline" className="cursor-pointer" onClick={() => setFormOpen(false)}>
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
            <DialogTitle>{t("settings.sdiAccounts.confirmDelete")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("settings.sdiAccounts.confirmDeleteDesc")} <strong>{deleteTarget?.name} ({deleteTarget?.code})</strong>?
          </p>
          <DialogFooter>
            <Button variant="destructive" className="cursor-pointer" onClick={handleDelete} disabled={isSubmitting}>
              <Trash2 className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.deleting") : t("common.delete")}
            </Button>
            <Button variant="outline" className="cursor-pointer" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
