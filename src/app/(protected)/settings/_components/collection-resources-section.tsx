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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Landmark, Pencil, Save, Trash2, X, Check, AlertCircle, Loader2, Eye, EyeOff, Power, PowerOff } from "lucide-react";
import {
  createCollectionResourceAction,
  updateCollectionResourceAction,
  deleteCollectionResourceAction,
  toggleCollectionResourceActiveAction,
  seedCollectionResourcesAction,
} from "@/app/actions/collection-resources";
import { validateIbanAction } from "@/app/actions/iban";
import type { CollectionResource, CollectionResourceType } from "@/types/supabase";
import { useTranslation } from "@/lib/i18n/context";

const TYPE_OPTIONS: { value: CollectionResourceType; labelKey: string }[] = [
  { value: "bank_account", labelKey: "settings.collectionResources.bankAccount" },
  { value: "online_platform", labelKey: "settings.collectionResources.onlinePlatform" },
  { value: "cash", labelKey: "settings.collectionResources.cash" },
  { value: "other", labelKey: "settings.collectionResources.other" },
];

function TypeBadge({ type, t }: { type: CollectionResourceType; t: (key: string) => string }) {
  const labels: Record<CollectionResourceType, { key: string; className: string }> = {
    bank_account: { key: "settings.collectionResources.bankAccount", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
    online_platform: { key: "settings.collectionResources.onlinePlatform", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
    cash: { key: "settings.collectionResources.cash", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    other: { key: "settings.collectionResources.other", className: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" },
  };
  const info = labels[type];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${info.className}`}>
      {t(info.key)}
    </span>
  );
}

interface Props {
  orgId: string;
}

export function CollectionResourcesSection({ orgId }: Props) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resources, setResources] = useState<CollectionResource[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CollectionResource | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formType, setFormType] = useState<CollectionResourceType>("bank_account");
  const [formIban, setFormIban] = useState("");

  // IBAN validation state
  const [ibanStatus, setIbanStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [ibanError, setIbanError] = useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<CollectionResource | null>(null);

  // Filter state
  const [showDeactivated, setShowDeactivated] = useState(false);

  const loadData = useCallback(async () => {
    const params = new URLSearchParams({ orgId });
    if (showDeactivated) params.set("includeDeactivated", "true");
    const res = await fetch(`/api/collection-resources?${params}`);
    const data = await res.json();
    setResources(data.resources ?? []);
    setLoading(false);
  }, [orgId, showDeactivated]);

  useEffect(() => { loadData(); }, [loadData]);

  function openCreate() {
    setEditing(null);
    setFormName(""); setFormCode(""); setFormType("bank_account"); setFormIban("");
    setIbanStatus("idle"); setIbanError("");
    setFormOpen(true);
  }

  function openEdit(res: CollectionResource) {
    setEditing(res);
    setFormName(res.name); setFormCode(res.code); setFormType(res.type);
    setFormIban(res.iban ?? "");
    setIbanStatus(res.iban ? "valid" : "idle"); setIbanError("");
    setFormOpen(true);
  }

  async function handleIbanBlur() {
    if (formType !== "bank_account" || !formIban.trim()) {
      setIbanStatus("idle");
      setIbanError("");
      return;
    }
    setIbanStatus("checking");
    const result = await validateIbanAction(formIban);
    if (result.valid) {
      setIbanStatus("valid");
      setIbanError("");
    } else {
      setIbanStatus("invalid");
      setIbanError(result.error ?? "IBAN non valido");
    }
  }

  async function handleSave() {
    setIsSubmitting(true);
    const data = {
      name: formName,
      code: formCode,
      type: formType,
      iban: formType === "bank_account" ? formIban : null,
    };

    if (editing) {
      const result = await updateCollectionResourceAction(editing.id, data);
      if (result.error) { toast.error(result.error); }
      else { toast.success(t("settings.collectionResources.updated")); setFormOpen(false); loadData(); }
    } else {
      const result = await createCollectionResourceAction(data);
      if (result.error) { toast.error(result.error); }
      else { toast.success(t("settings.collectionResources.created")); setFormOpen(false); loadData(); }
    }
    setIsSubmitting(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    const result = await deleteCollectionResourceAction(deleteTarget.id);
    if (result.error) { toast.error(result.error); }
    else { toast.success(t("settings.collectionResources.deleted")); setDeleteTarget(null); loadData(); }
    setIsSubmitting(false);
  }

  async function handleToggleActive(res: CollectionResource) {
    setIsSubmitting(true);
    const result = await toggleCollectionResourceActiveAction(res.id);
    if (result.error) { toast.error(result.error); }
    else {
      toast.success(result.is_active
        ? t("common.reactivate")
        : t("settings.collectionResources.deactivated"));
      loadData();
    }
    setIsSubmitting(false);
  }

  const isSaveDisabled = isSubmitting || !formName.trim() || !formCode.trim() ||
    (formType === "bank_account" && (!formIban.trim() || ibanStatus === "invalid" || ibanStatus === "checking"));

  if (loading) {
    return <p className="text-muted-foreground text-center py-8">{t("common.loading")}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            {t("settings.collectionResources.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("settings.collectionResources.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showDeactivated ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowDeactivated(!showDeactivated)}
            title={showDeactivated ? t("settings.paymentTypes.hideDeactivated") : t("settings.paymentTypes.showDeactivated")}
          >
            {showDeactivated ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {t("settings.collectionResources.deactivated")}
          </Button>
          <Button size="sm" onClick={openCreate}>
            {t("settings.collectionResources.newResource")}
          </Button>
        </div>
      </div>

      {resources.length === 0 ? (
        <div className="text-center py-8 space-y-4">
          <p className="text-muted-foreground">{t("settings.collectionResources.noResourcesConfigured")}</p>
          <Button
            variant="outline"
            onClick={async () => {
              setIsSubmitting(true);
              const result = await seedCollectionResourcesAction();
              if (result.error) toast.error(result.error);
              else { toast.success(t("settings.collectionResources.seedLoaded")); loadData(); }
              setIsSubmitting(false);
            }}
            disabled={isSubmitting}
          >
            <Landmark className="h-4 w-4 mr-1" />
            {isSubmitting ? t("common.loading") : t("settings.collectionResources.seedDefault")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {resources.map((res) => (
            <div
              key={res.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${!res.is_active ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono font-bold text-sm bg-muted px-2 py-0.5 rounded shrink-0">{res.code}</span>
                <div className="min-w-0">
                  <span className="font-medium text-sm block truncate">{res.name}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-2">
                    <TypeBadge type={res.type} t={t} />
                    {res.iban && <span className="font-mono">{res.iban}</span>}
                    {!res.is_active && <span> — {t("settings.collectionResources.deactivated")}</span>}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(res)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleToggleActive(res)}
                  disabled={isSubmitting}
                  title={res.is_active ? t("common.deactivate") : t("common.reactivate")}
                >
                  {res.is_active
                    ? <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
                    : <Power className="h-3.5 w-3.5 text-green-600" />
                  }
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(res)}>
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
              {editing ? t("settings.collectionResources.editResource") : t("settings.collectionResources.newResourceTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="resName">{t("settings.collectionResources.name")}</Label>
                <Input id="resName" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={t("settings.collectionResources.namePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resCode">{t("settings.collectionResources.code")}</Label>
                <Input id="resCode" value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder={t("settings.collectionResources.codePlaceholder")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("settings.collectionResources.type")}</Label>
              <Select value={formType} onValueChange={(v) => {
                setFormType(v as CollectionResourceType);
                if (v !== "bank_account") {
                  setIbanStatus("idle");
                  setIbanError("");
                }
              }}>
                <SelectTrigger className="!w-full">
                  <SelectValue placeholder={t("settings.collectionResources.selectType")}>
                    {TYPE_OPTIONS.find((o) => o.value === formType)
                      ? t(TYPE_OPTIONS.find((o) => o.value === formType)!.labelKey)
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formType === "bank_account" && (
              <div className="space-y-2">
                <Label htmlFor="resIban">{t("settings.collectionResources.iban")}</Label>
                <div className="relative">
                  <Input
                    id="resIban"
                    value={formIban}
                    onChange={(e) => {
                      setFormIban(e.target.value);
                      setIbanStatus("idle");
                      setIbanError("");
                    }}
                    onBlur={handleIbanBlur}
                    placeholder={t("settings.collectionResources.ibanPlaceholder")}
                    className={
                      ibanStatus === "valid" ? "border-green-500 pr-8" :
                      ibanStatus === "invalid" ? "border-destructive pr-8" : ""
                    }
                  />
                  {ibanStatus === "checking" && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {ibanStatus === "valid" && (
                    <Check className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                  {ibanStatus === "invalid" && (
                    <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                  )}
                </div>
                {ibanStatus === "valid" && (
                  <p className="text-xs text-green-600">{t("settings.collectionResources.ibanValid")}</p>
                )}
                {ibanStatus === "invalid" && (
                  <p className="text-xs text-destructive">{ibanError || t("settings.collectionResources.ibanInvalid")}</p>
                )}
                {ibanStatus === "checking" && (
                  <p className="text-xs text-muted-foreground">{t("settings.collectionResources.ibanChecking")}</p>
                )}
              </div>
            )}
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
            <DialogTitle>{t("settings.collectionResources.confirmDelete")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("settings.collectionResources.confirmDeleteDesc")} <strong>{deleteTarget?.name} ({deleteTarget?.code})</strong>?
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
