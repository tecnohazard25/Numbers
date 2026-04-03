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
import { Pencil, Receipt, Save, Trash2, X } from "lucide-react";
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

interface Props {
  orgId: string;
}

export function VatCodesSection({ orgId }: Props) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vatCodes, setVatCodes] = useState<VatCode[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VatCode | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formRate, setFormRate] = useState("0");
  const [formNature, setFormNature] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<VatCode | null>(null);

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/vat-codes?orgId=${orgId}`);
    const data = await res.json();
    setVatCodes(data.vatCodes ?? []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { loadData(); }, [loadData]);

  function openCreate() {
    setEditing(null);
    setFormCode(""); setFormDescription(""); setFormRate("0"); setFormNature(""); setFormIsActive(true);
    setFormOpen(true);
  }

  function openEdit(vc: VatCode) {
    setEditing(vc);
    setFormCode(vc.code); setFormDescription(vc.description);
    setFormRate(String(vc.rate)); setFormNature(vc.nature ?? ""); setFormIsActive(vc.is_active);
    setFormOpen(true);
  }

  async function handleSave() {
    setIsSubmitting(true);
    const rate = parseFloat(formRate) || 0;
    const nature = formNature.trim() || null;

    if (editing) {
      const result = await updateVatCodeAction(editing.id, formCode, formDescription, rate, nature, formIsActive);
      if (result.error) { toast.error(result.error); }
      else { toast.success(t("settings.vatCodes.updated")); setFormOpen(false); loadData(); }
    } else {
      const result = await createVatCodeAction(formCode, formDescription, rate, nature);
      if (result.error) { toast.error(result.error); }
      else { toast.success(t("settings.vatCodes.created")); setFormOpen(false); loadData(); }
    }
    setIsSubmitting(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    const result = await deleteVatCodeAction(deleteTarget.id);
    if (result.error) { toast.error(result.error); }
    else { toast.success(t("settings.vatCodes.deleted")); setDeleteTarget(null); loadData(); }
    setIsSubmitting(false);
  }

  if (loading) {
    return <p className="text-muted-foreground text-center py-8">{t("common.loading")}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {t("settings.vatCodes.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("settings.vatCodes.description")}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          {t("settings.vatCodes.newCode")}
        </Button>
      </div>

      {vatCodes.length === 0 ? (
        <div className="text-center py-8 space-y-4">
          <p className="text-muted-foreground">{t("settings.vatCodes.noCodesConfigured")}</p>
          <Button
            variant="outline"
            onClick={async () => {
              setIsSubmitting(true);
              const result = await seedVatCodesForCurrentOrg();
              if (result.error) toast.error(result.error);
              else { toast.success(t("settings.vatCodes.italianCodesLoaded")); loadData(); }
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
              className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${!vc.is_active ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono font-bold text-sm bg-muted px-2 py-0.5 rounded shrink-0">{vc.code}</span>
                <div className="min-w-0">
                  <span className="font-medium text-sm block truncate">{vc.description}</span>
                  <span className="text-xs text-muted-foreground">
                    {vc.rate > 0 ? `${vc.rate}%` : "0%"}
                    {vc.nature && ` — ${t("settings.vatCodes.nature")}: ${vc.nature}`}
                    {!vc.is_active && ` — ${t("settings.vatCodes.deactivated")}`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(vc)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(vc)}>
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
              {editing ? t("settings.vatCodes.editCode") : t("settings.vatCodes.newCodeTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vatCode">{t("settings.vatCodes.code")}</Label>
                <Input id="vatCode" value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder={t("settings.vatCodes.codePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vatRate">{t("settings.vatCodes.rate")}</Label>
                <Input id="vatRate" type="number" min="0" max="100" step="0.01" value={formRate} onChange={(e) => setFormRate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vatDescription">{t("settings.vatCodes.description")}</Label>
              <Input id="vatDescription" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder={t("settings.vatCodes.descriptionPlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.vatCodes.nature")}</Label>
              <Select value={formNature} onValueChange={(v) => setFormNature(v ?? "")}>
                <SelectTrigger className="!w-full min-w-0 overflow-hidden whitespace-normal">
                  <SelectValue placeholder={t("settings.vatCodes.selectNature")} className="truncate">
                    {formNature ? <span className="truncate">{NATURE_OPTIONS.find((n) => n.value === formNature)?.label ?? formNature}</span> : null}
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
            {editing && (
              <div className="flex items-center gap-2">
                <input id="vatIsActive" type="checkbox" checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                <Label htmlFor="vatIsActive">{t("settings.vatCodes.isActive")}</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={isSubmitting || !formCode.trim() || !formDescription.trim()}>
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
            <DialogTitle>{t("settings.vatCodes.confirmDelete")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("settings.vatCodes.confirmDeleteDesc")} <strong>{deleteTarget?.code} — {deleteTarget?.description}</strong>?
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
