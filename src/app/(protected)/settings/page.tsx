"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import {
  Settings,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Receipt,
} from "lucide-react";
import {
  createVatCodeAction,
  updateVatCodeAction,
  deleteVatCodeAction,
  seedVatCodesForCurrentOrg,
} from "@/app/actions/vat-codes";
import type { VatCode } from "@/types/supabase";
import { useTranslation } from "@/lib/i18n/context";

const NATURE_OPTIONS = [
  { value: "", label: "Nessuna" },
  { value: "N1", label: "N1 — Escluse ex art. 15 del DPR 633/72" },
  { value: "N2.1", label: "N2.1 — Non soggette ad IVA ai sensi degli artt. da 7 a 7-septies del DPR 633/72" },
  { value: "N2.2", label: "N2.2 — Non soggette - altri casi" },
  { value: "N3.1", label: "N3.1 — Non imponibili - esportazioni" },
  { value: "N3.2", label: "N3.2 — Non imponibili - cessioni intracomunitarie" },
  { value: "N3.3", label: "N3.3 — Non imponibili - cessioni verso San Marino" },
  { value: "N3.4", label: "N3.4 — Non imponibili - operazioni assimilate alle cessioni all'esportazione" },
  { value: "N3.5", label: "N3.5 — Non imponibili - a seguito di dichiarazioni d'intento" },
  { value: "N3.6", label: "N3.6 — Non imponibili - altre operazioni che non concorrono alla formazione del plafond" },
  { value: "N4", label: "N4 — Esenti" },
  { value: "N5", label: "N5 — Regime del margine / IVA non esposta in fattura" },
  { value: "N6.1", label: "N6.1 — Inversione contabile - cessione di rottami e altri materiali di recupero" },
  { value: "N6.2", label: "N6.2 — Inversione contabile - cessione di oro e argento puro" },
  { value: "N6.3", label: "N6.3 — Inversione contabile - subappalto nel settore edile" },
  { value: "N6.4", label: "N6.4 — Inversione contabile - cessione di fabbricati" },
  { value: "N6.5", label: "N6.5 — Inversione contabile - cessione di telefoni cellulari" },
  { value: "N6.6", label: "N6.6 — Inversione contabile - cessione di prodotti elettronici" },
  { value: "N6.7", label: "N6.7 — Inversione contabile - prestazioni comparto edile e settori connessi" },
  { value: "N6.8", label: "N6.8 — Inversione contabile - operazioni settore energetico" },
  { value: "N6.9", label: "N6.9 — Inversione contabile - altri casi" },
  { value: "N7", label: "N7 — IVA assolta in altro stato UE" },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // VAT codes state
  const [vatCodes, setVatCodes] = useState<VatCode[]>([]);
  const [loadingVatCodes, setLoadingVatCodes] = useState(true);

  // VAT code form
  const [vatFormOpen, setVatFormOpen] = useState(false);
  const [editingVatCode, setEditingVatCode] = useState<VatCode | null>(null);
  const [vatFormCode, setVatFormCode] = useState("");
  const [vatFormDescription, setVatFormDescription] = useState("");
  const [vatFormRate, setVatFormRate] = useState("0");
  const [vatFormNature, setVatFormNature] = useState("");
  const [vatFormIsActive, setVatFormIsActive] = useState(true);

  // VAT code delete
  const [vatDeleteTarget, setVatDeleteTarget] = useState<VatCode | null>(null);

  useEffect(() => {
    async function init() {
      const res = await fetch("/api/user-info");
      const data = await res.json();
      const roles: string[] = data.roles ?? [];

      if (!roles.includes("accountant")) {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);
      setOrgId(data.profile?.organization_id ?? null);
    }
    init();
  }, [router]);

  const loadVatCodes = useCallback(async () => {
    if (!orgId) return;
    const res = await fetch(`/api/vat-codes?orgId=${orgId}`);
    const data = await res.json();
    setVatCodes(data.vatCodes ?? []);
    setLoadingVatCodes(false);
  }, [orgId]);

  useEffect(() => {
    if (orgId) loadVatCodes();
  }, [orgId, loadVatCodes]);

  function openVatCreateForm() {
    setEditingVatCode(null);
    setVatFormCode("");
    setVatFormDescription("");
    setVatFormRate("0");
    setVatFormNature("");
    setVatFormIsActive(true);
    setVatFormOpen(true);
  }

  function openVatEditForm(vc: VatCode) {
    setEditingVatCode(vc);
    setVatFormCode(vc.code);
    setVatFormDescription(vc.description);
    setVatFormRate(String(vc.rate));
    setVatFormNature(vc.nature ?? "");
    setVatFormIsActive(vc.is_active);
    setVatFormOpen(true);
  }

  async function handleVatSave() {
    setIsSubmitting(true);
    const rate = parseFloat(vatFormRate) || 0;
    const nature = vatFormNature.trim() || null;

    if (editingVatCode) {
      const result = await updateVatCodeAction(
        editingVatCode.id,
        vatFormCode,
        vatFormDescription,
        rate,
        nature,
        vatFormIsActive
      );
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(t("settings.vatCodes.updated"));
        setVatFormOpen(false);
        loadVatCodes();
      }
    } else {
      const result = await createVatCodeAction(
        vatFormCode,
        vatFormDescription,
        rate,
        nature
      );
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(t("settings.vatCodes.created"));
        setVatFormOpen(false);
        loadVatCodes();
      }
    }
    setIsSubmitting(false);
  }

  async function handleVatDelete() {
    if (!vatDeleteTarget) return;
    setIsSubmitting(true);
    const result = await deleteVatCodeAction(vatDeleteTarget.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("settings.vatCodes.deleted"));
      setVatDeleteTarget(null);
      loadVatCodes();
    }
    setIsSubmitting(false);
  }

  if (!authorized) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Settings className="h-6 w-6" />
        {t("settings.title")}
      </h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              {t("settings.vatCodes.title")}
            </CardTitle>
            <CardDescription>
              {t("settings.vatCodes.description")}
            </CardDescription>
          </div>
          <Button size="sm" onClick={openVatCreateForm}>
            <Plus className="h-4 w-4 mr-1" />
            {t("settings.vatCodes.newCode")}
          </Button>
        </CardHeader>
        <CardContent>
          {loadingVatCodes ? (
            <p className="text-muted-foreground text-center py-8">
              {t("common.loading")}
            </p>
          ) : vatCodes.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <p className="text-muted-foreground">
                {t("settings.vatCodes.noCodesConfigured")}
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  setIsSubmitting(true);
                  const result = await seedVatCodesForCurrentOrg();
                  if (result.error) {
                    toast.error(result.error);
                  } else {
                    toast.success(t("settings.vatCodes.italianCodesLoaded"));
                    loadVatCodes();
                  }
                  setIsSubmitting(false);
                }}
                disabled={isSubmitting}
              >
                <Receipt className="h-4 w-4 mr-1" />
                {isSubmitting ? t("common.loading") : t("settings.vatCodes.seedItalianCodes")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {vatCodes.map((vc) => (
                <div
                  key={vc.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                    !vc.is_active ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono font-bold text-sm bg-muted px-2 py-0.5 rounded shrink-0">
                      {vc.code}
                    </span>
                    <div className="min-w-0">
                      <span className="font-medium text-sm block truncate">
                        {vc.description}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {vc.rate > 0 ? `${vc.rate}%` : "0%"}
                        {vc.nature && ` — ${t("settings.vatCodes.nature")}: ${vc.nature}`}
                        {!vc.is_active && ` — ${t("settings.vatCodes.deactivated")}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openVatEditForm(vc)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setVatDeleteTarget(vc)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit VAT Code Dialog */}
      <Dialog open={vatFormOpen} onOpenChange={setVatFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingVatCode ? t("settings.vatCodes.editCode") : t("settings.vatCodes.newCodeTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vatCode">{t("settings.vatCodes.code")}</Label>
                <Input
                  id="vatCode"
                  value={vatFormCode}
                  onChange={(e) => setVatFormCode(e.target.value)}
                  placeholder={t("settings.vatCodes.codePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vatRate">{t("settings.vatCodes.rate")}</Label>
                <Input
                  id="vatRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={vatFormRate}
                  onChange={(e) => setVatFormRate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vatDescription">{t("settings.vatCodes.description")}</Label>
              <Input
                id="vatDescription"
                value={vatFormDescription}
                onChange={(e) => setVatFormDescription(e.target.value)}
                placeholder={t("settings.vatCodes.descriptionPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.vatCodes.nature")}</Label>
              <Select
                value={vatFormNature}
                onValueChange={(v) => setVatFormNature(v ?? "")}
              >
                <SelectTrigger className="!w-full min-w-0 overflow-hidden whitespace-normal">
                  <SelectValue placeholder={t("settings.vatCodes.selectNature")} className="truncate">
                    {vatFormNature
                      ? <span className="truncate">{NATURE_OPTIONS.find((n) => n.value === vatFormNature)?.label ?? vatFormNature}</span>
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-w-[min(28rem,90vw)]">
                  {NATURE_OPTIONS.map((n) => (
                    <SelectItem key={n.value || "_none"} value={n.value} className="whitespace-normal">
                      {n.value === "" ? t("settings.vatCodes.none") : n.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingVatCode && (
              <div className="flex items-center gap-2">
                <input
                  id="vatIsActive"
                  type="checkbox"
                  checked={vatFormIsActive}
                  onChange={(e) => setVatFormIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="vatIsActive">{t("settings.vatCodes.isActive")}</Label>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-2">
            <Button variant="outline" onClick={() => setVatFormOpen(false)}>
              <X className="h-4 w-4 mr-1" />
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleVatSave}
              disabled={isSubmitting || !vatFormCode.trim() || !vatFormDescription.trim()}
            >
              <Save className="h-4 w-4 mr-1" />
              {isSubmitting
                ? t("common.saving")
                : editingVatCode
                  ? t("common.update")
                  : t("common.create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete VAT Code Confirmation Dialog */}
      <Dialog open={!!vatDeleteTarget} onOpenChange={(open) => !open && setVatDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.vatCodes.confirmDelete")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("settings.vatCodes.confirmDeleteDesc", {
              code: vatDeleteTarget?.code ?? "",
              description: vatDeleteTarget?.description ?? "",
            })}
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setVatDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleVatDelete}
              disabled={isSubmitting}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.deleting") : t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
