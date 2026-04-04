"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Building2,
  MapPin,
  DoorOpen,
  Stethoscope,
  Activity,
  Save,
  X,
  Trash2,
  Eye,
  EyeOff,
  Power,
  PowerOff,
  Pencil,
  Upload,
} from "lucide-react";
import {
  createEntityAction,
  updateEntityAction,
  deleteEntityAction,
  toggleEntityActiveAction,
} from "@/app/actions/entities";
import type { EntityType, Entity, EntityWithRelations } from "@/types/supabase";
import { useTranslation } from "@/lib/i18n/context";
import { EntitiesImportDialog } from "./entities-import-dialog";

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

const ENTITY_TABS: { key: EntityType; icon: typeof Building2; labelKey: string; color: string }[] = [
  { key: "branch", icon: Building2, labelKey: "settings.entities.branch", color: "text-violet-500" },
  { key: "workplace", icon: MapPin, labelKey: "settings.entities.workplace", color: "text-blue-500" },
  { key: "room", icon: DoorOpen, labelKey: "settings.entities.room", color: "text-teal-500" },
  { key: "doctor", icon: Stethoscope, labelKey: "settings.entities.doctor", color: "text-emerald-500" },
  { key: "activity", icon: Activity, labelKey: "settings.entities.activity", color: "text-amber-500" },
];

const TYPE_COLORS: Record<EntityType, { border: string; codeBg: string; codeText: string }> = {
  branch: { border: "border-l-violet-500", codeBg: "bg-violet-500/15", codeText: "text-violet-700 dark:text-violet-300" },
  workplace: { border: "border-l-blue-500", codeBg: "bg-blue-500/15", codeText: "text-blue-700 dark:text-blue-300" },
  room: { border: "border-l-teal-500", codeBg: "bg-teal-500/15", codeText: "text-teal-700 dark:text-teal-300" },
  doctor: { border: "border-l-emerald-500", codeBg: "bg-emerald-500/15", codeText: "text-emerald-700 dark:text-emerald-300" },
  activity: { border: "border-l-amber-500", codeBg: "bg-amber-500/15", codeText: "text-amber-700 dark:text-amber-300" },
};

const NEW_TITLE_KEYS: Record<EntityType, string> = {
  branch: "settings.entities.newBranch",
  workplace: "settings.entities.newWorkplace",
  room: "settings.entities.newRoom",
  doctor: "settings.entities.newDoctor",
  activity: "settings.entities.newActivity",
};

const EDIT_TITLE_KEYS: Record<EntityType, string> = {
  branch: "settings.entities.editBranch",
  workplace: "settings.entities.editWorkplace",
  room: "settings.entities.editRoom",
  doctor: "settings.entities.editDoctor",
  activity: "settings.entities.editActivity",
};

/** Build a type-specific i18n key like "settings.entities.createdBranch" */
function typeKey(prefix: string, type: EntityType): string {
  const capitalized = type.charAt(0).toUpperCase() + type.slice(1);
  return `settings.entities.${prefix}${capitalized}`;
}

interface Props {
  orgId: string;
}

export function EntitiesSection({ orgId }: Props) {
  const { t } = useTranslation();
  const [activeType, setActiveType] = useState<EntityType>("branch");
  const [entities, setEntities] = useState<EntityWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Lookup data for selects
  const [allBranches, setAllBranches] = useState<Entity[]>([]);
  const [allWorkplaces, setAllWorkplaces] = useState<Entity[]>([]);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EntityWithRelations | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formAddress, setFormAddress] = useState("");
  const [formWorkplaceId, setFormWorkplaceId] = useState("");
  const [formDoctorBranchIds, setFormDoctorBranchIds] = useState<string[]>([]);
  const [formDoctorWorkplaceIds, setFormDoctorWorkplaceIds] = useState<string[]>([]);
  const [formActivityBranchId, setFormActivityBranchId] = useState("");
  const [formActivityWorkplaceIds, setFormActivityWorkplaceIds] = useState<string[]>([]);
  const [formAvgSellingPrice, setFormAvgSellingPrice] = useState("");
  const [formDurationMinutes, setFormDurationMinutes] = useState("");
  const [formAvgCostLab, setFormAvgCostLab] = useState("");
  const [formAvgCostStaff, setFormAvgCostStaff] = useState("");
  const [formAvgCostMaterials, setFormAvgCostMaterials] = useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<EntityWithRelations | null>(null);

  // Import state
  const [importOpen, setImportOpen] = useState(false);

  // Abort controller to cancel in-flight requests when switching tabs
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const params = new URLSearchParams({ orgId, type: activeType });
      if (showInactive) params.set("includeInactive", "true");
      const res = await fetch(`/api/entities?${params}`, { signal: controller.signal });
      const data = await res.json();
      if (!controller.signal.aborted) {
        setEntities(data.entities ?? []);
        setLoading(false);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      throw e;
    }
  }, [orgId, activeType, showInactive]);

  const loadLookups = useCallback(async () => {
    const [branchRes, workplaceRes] = await Promise.all([
      fetch(`/api/entities?${new URLSearchParams({ orgId, type: "branch" })}`),
      fetch(`/api/entities?${new URLSearchParams({ orgId, type: "workplace" })}`),
    ]);
    const branchData = await branchRes.json();
    const workplaceData = await workplaceRes.json();
    setAllBranches(branchData.entities ?? []);
    setAllWorkplaces(workplaceData.entities ?? []);
  }, [orgId]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadLookups(); }, [loadLookups]);

  // Reset showInactive when switching entity type
  useEffect(() => {
    setShowInactive(false);
  }, [activeType]);

  useEffect(() => {
    if (activeType === "room" || activeType === "doctor" || activeType === "activity") {
      loadLookups();
    }
  }, [activeType, loadLookups]);

  function resetForm() {
    setFormName(""); setFormCode(""); setCodeManuallyEdited(false); setFormIsActive(true);
    setFormAddress(""); setFormWorkplaceId("");
    setFormDoctorBranchIds([]); setFormDoctorWorkplaceIds([]);
    setFormActivityBranchId(""); setFormActivityWorkplaceIds([]);
    setFormAvgSellingPrice(""); setFormDurationMinutes("");
    setFormAvgCostLab(""); setFormAvgCostStaff(""); setFormAvgCostMaterials("");
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setFormOpen(true);
  }

  function openEdit(entity: EntityWithRelations) {
    setEditing(entity);
    setFormName(entity.name); setFormCode(entity.code); setCodeManuallyEdited(true);
    setFormIsActive(entity.is_active);
    setFormAddress(entity.workplace_address ?? "");
    setFormWorkplaceId(entity.room_workplace_id ?? "");
    setFormActivityBranchId(entity.activity_branch_id ?? "");
    setFormAvgSellingPrice(entity.activity_avg_selling_price?.toString() ?? "");
    setFormDurationMinutes(entity.activity_duration_minutes?.toString() ?? "");
    setFormAvgCostLab(entity.activity_avg_cost_lab?.toString() ?? "");
    setFormAvgCostStaff(entity.activity_avg_cost_staff?.toString() ?? "");
    setFormAvgCostMaterials(entity.activity_avg_cost_materials?.toString() ?? "");
    setFormDoctorBranchIds(entity.entity_doctor_branches?.map((j) => j.branch_id) ?? []);
    setFormDoctorWorkplaceIds(entity.entity_doctor_workplaces?.map((j) => j.workplace_id) ?? []);
    setFormActivityWorkplaceIds(entity.entity_activity_workplaces?.map((j) => j.workplace_id) ?? []);
    setFormOpen(true);
  }

  function handleNameChange(value: string) {
    setFormName(value);
    if (!codeManuallyEdited) setFormCode(toSnakeCase(value));
  }

  function handleCodeChange(value: string) {
    setFormCode(value);
    setCodeManuallyEdited(true);
  }

  function parseNumber(val: string): number | null {
    if (!val.trim()) return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }

  async function handleSave() {
    setIsSubmitting(true);
    const inputData = {
      type: activeType,
      code: formCode,
      name: formName,
      is_active: formIsActive,
      workplace_address: activeType === "workplace" ? formAddress || null : null,
      room_workplace_id: activeType === "room" ? formWorkplaceId || null : null,
      activity_branch_id: activeType === "activity" ? formActivityBranchId || null : null,
      activity_avg_selling_price: activeType === "activity" ? parseNumber(formAvgSellingPrice) : null,
      activity_duration_minutes: activeType === "activity" ? (parseNumber(formDurationMinutes) ? Math.round(parseNumber(formDurationMinutes)!) : null) : null,
      activity_avg_cost_lab: activeType === "activity" ? parseNumber(formAvgCostLab) : null,
      activity_avg_cost_staff: activeType === "activity" ? parseNumber(formAvgCostStaff) : null,
      activity_avg_cost_materials: activeType === "activity" ? parseNumber(formAvgCostMaterials) : null,
      doctor_branch_ids: activeType === "doctor" ? formDoctorBranchIds : undefined,
      doctor_workplace_ids: activeType === "doctor" ? formDoctorWorkplaceIds : undefined,
      activity_workplace_ids: activeType === "activity" ? formActivityWorkplaceIds : undefined,
    };

    if (editing) {
      const result = await updateEntityAction(editing.id, inputData);
      if (result.error) { toast.error(result.error); }
      else { toast.success(t(typeKey("updated", activeType))); setFormOpen(false); await loadData(); await loadLookups(); }
    } else {
      const result = await createEntityAction(inputData);
      if (result.error) { toast.error(result.error); }
      else { toast.success(t(typeKey("created", activeType))); setFormOpen(false); await loadData(); await loadLookups(); }
    }
    setIsSubmitting(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    const result = await deleteEntityAction(deleteTarget.id);
    if (result.error) { toast.error(result.error); }
    else {
      toast.success(result.softDeleted ? t(typeKey("deactivated", activeType)) : t(typeKey("deleted", activeType)));
      setDeleteTarget(null); await loadData(); await loadLookups();
    }
    setIsSubmitting(false);
  }

  async function handleToggleActive(entity: EntityWithRelations) {
    setIsSubmitting(true);
    const result = await toggleEntityActiveAction(entity.id);
    if (result.error) { toast.error(result.error); }
    else { toast.success(result.is_active ? t(typeKey("reactivated", activeType)) : t(typeKey("deactivated", activeType))); await loadData(); }
    setIsSubmitting(false);
  }

  const isSaveDisabled = isSubmitting || !formName.trim() || !formCode.trim() ||
    (activeType === "room" && !formWorkplaceId);

  function toggleMultiSelect(id: string, current: string[], setter: (v: string[]) => void) {
    setter(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  /** Render the detail line below entity name, type-specific */
  function renderEntityDetail(entity: EntityWithRelations) {
    if (activeType === "workplace" && entity.workplace_address) {
      return <span className="text-xs text-muted-foreground">{entity.workplace_address}</span>;
    }
    if (activeType === "room" && entity.room_workplace) {
      return <span className="text-xs text-muted-foreground">{t("settings.entities.workplaceSede")}: {entity.room_workplace.name}</span>;
    }
    if (activeType === "activity") {
      const parts: React.ReactNode[] = [];
      if (entity.activity_branch) {
        parts.push(<span key="branch" className="text-violet-600 dark:text-violet-400">{entity.activity_branch.name}</span>);
      }
      if (entity.activity_duration_minutes) {
        parts.push(<span key="dur">{entity.activity_duration_minutes} {t("settings.entities.min")}</span>);
      }
      if (entity.activity_avg_selling_price != null) {
        parts.push(<span key="price" className="text-emerald-600 dark:text-emerald-400 font-medium">€ {Number(entity.activity_avg_selling_price).toFixed(2)}</span>);
      }
      if (parts.length > 0) {
        return <span className="text-xs text-muted-foreground flex items-center gap-1.5">{parts.map((p, i) => <span key={i} className="contents">{i > 0 && <span className="opacity-40">·</span>}{p}</span>)}</span>;
      }
    }
    if (!entity.is_active) {
      return <span className="text-xs text-muted-foreground">{t("common.inactive")}</span>;
    }
    return null;
  }

  if (loading) {
    return <p className="text-muted-foreground text-center py-8">{t("common.loading")}</p>;
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t("settings.entities.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("settings.entities.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showInactive ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            title={showInactive ? t("settings.entities.hideInactive") : t("settings.entities.showInactive")}
            className="cursor-pointer"
          >
            {showInactive ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {t("settings.paymentTypes.deactivated")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="cursor-pointer">
            <Upload className="h-4 w-4 mr-1" />
            {t("settings.entities.import.importButton")}
          </Button>
          <Button size="sm" onClick={openCreate} className="cursor-pointer">
            {t(NEW_TITLE_KEYS[activeType])}
          </Button>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b mb-4 overflow-x-auto scrollbar-none">
        {ENTITY_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeType === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              onClick={() => setActiveType(tab.key)}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? tab.color : ""}`} />
              <span className="hidden sm:inline">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Entity list */}
      {entities.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">{t(typeKey("noItems", activeType))}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entities.map((entity) => {
            const colors = TYPE_COLORS[activeType];
            return (
            <div
              key={entity.id}
              className={`flex items-center justify-between gap-3 rounded-lg border border-l-4 ${colors.border} px-4 py-3 ${!entity.is_active ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`font-mono font-bold text-sm ${colors.codeBg} ${colors.codeText} px-2 py-0.5 rounded shrink-0`}>{entity.code}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{entity.name}</span>
                    {/* Badges for doctor branches */}
                    {activeType === "doctor" && entity.entity_doctor_branches?.map((b) => (
                      <Badge key={b.branch_id} className="text-xs shrink-0 bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30">{b.entities?.name}</Badge>
                    ))}
                    {/* Badges for doctor/activity workplaces */}
                    {activeType === "doctor" && entity.entity_doctor_workplaces?.map((w) => (
                      <Badge key={w.workplace_id} className="text-xs shrink-0 bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30">{w.entities?.name}</Badge>
                    ))}
                    {activeType === "activity" && entity.entity_activity_workplaces?.map((w) => (
                      <Badge key={w.workplace_id} className="text-xs shrink-0 bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30">{w.entities?.name}</Badge>
                    ))}
                  </div>
                  {renderEntityDetail(entity)}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(entity)} className="cursor-pointer">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleToggleActive(entity)}
                  disabled={isSubmitting}
                  title={entity.is_active ? t("common.deactivate") : t("common.reactivate")}
                  className="cursor-pointer"
                >
                  {entity.is_active
                    ? <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
                    : <Power className="h-3.5 w-3.5 text-green-600" />
                  }
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(entity)} className="cursor-pointer">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t(EDIT_TITLE_KEYS[activeType]) : t(NEW_TITLE_KEYS[activeType])}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("settings.entities.name")}</Label>
                <Input value={formName} onChange={(e) => handleNameChange(e.target.value)} placeholder={t("settings.entities.namePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.entities.code")}</Label>
                <Input value={formCode} onChange={(e) => handleCodeChange(e.target.value)} placeholder={t("settings.entities.codePlaceholder")} />
              </div>
            </div>

            {activeType === "workplace" && (
              <div className="space-y-2">
                <Label>{t("settings.entities.address")}</Label>
                <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder={t("settings.entities.addressPlaceholder")} />
              </div>
            )}

            {activeType === "room" && (
              <div className="space-y-2">
                <Label>{t("settings.entities.workplaceSede")} *</Label>
                <Select value={formWorkplaceId} onValueChange={(v) => setFormWorkplaceId(v ?? "")}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder={t("settings.entities.selectWorkplace")}>
                      {allWorkplaces.find((w) => w.id === formWorkplaceId)?.name ?? null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {allWorkplaces.map((w) => (
                      <SelectItem key={w.id} value={w.id} className="cursor-pointer">{w.name} ({w.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeType === "doctor" && (
              <>
                <div className="space-y-2">
                  <Label>{t("settings.entities.branches")}</Label>
                  <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                    {allBranches.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("settings.entities.noBranches")}</p>
                    ) : allBranches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-1 py-0.5">
                        <input type="checkbox" checked={formDoctorBranchIds.includes(b.id)} onChange={() => toggleMultiSelect(b.id, formDoctorBranchIds, setFormDoctorBranchIds)} className="cursor-pointer" />
                        {b.name} <span className="text-muted-foreground">({b.code})</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.entities.workplaces")}</Label>
                  <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                    {allWorkplaces.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("settings.entities.noWorkplaces")}</p>
                    ) : allWorkplaces.map((w) => (
                      <label key={w.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-1 py-0.5">
                        <input type="checkbox" checked={formDoctorWorkplaceIds.includes(w.id)} onChange={() => toggleMultiSelect(w.id, formDoctorWorkplaceIds, setFormDoctorWorkplaceIds)} className="cursor-pointer" />
                        {w.name} <span className="text-muted-foreground">({w.code})</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeType === "activity" && (
              <>
                <div className="space-y-2">
                  <Label>{t("settings.entities.selectBranch")}</Label>
                  <Select value={formActivityBranchId} onValueChange={(v) => setFormActivityBranchId(v ?? "")}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder={t("settings.entities.selectBranch")}>
                        {allBranches.find((b) => b.id === formActivityBranchId)?.name ?? null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {allBranches.map((b) => (
                        <SelectItem key={b.id} value={b.id} className="cursor-pointer">{b.name} ({b.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("settings.entities.avgSellingPrice")}</Label>
                    <Input type="number" step="0.01" value={formAvgSellingPrice} onChange={(e) => setFormAvgSellingPrice(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settings.entities.durationMinutes")}</Label>
                    <Input type="number" value={formDurationMinutes} onChange={(e) => setFormDurationMinutes(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t("settings.entities.avgCostLab")}</Label>
                    <Input type="number" step="0.01" value={formAvgCostLab} onChange={(e) => setFormAvgCostLab(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settings.entities.avgCostStaff")}</Label>
                    <Input type="number" step="0.01" value={formAvgCostStaff} onChange={(e) => setFormAvgCostStaff(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settings.entities.avgCostMaterials")}</Label>
                    <Input type="number" step="0.01" value={formAvgCostMaterials} onChange={(e) => setFormAvgCostMaterials(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.entities.workplaces")}</Label>
                  <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                    {allWorkplaces.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("settings.entities.noWorkplaces")}</p>
                    ) : allWorkplaces.map((w) => (
                      <label key={w.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-1 py-0.5">
                        <input type="checkbox" checked={formActivityWorkplaceIds.includes(w.id)} onChange={() => toggleMultiSelect(w.id, formActivityWorkplaceIds, setFormActivityWorkplaceIds)} className="cursor-pointer" />
                        {w.name} <span className="text-muted-foreground">({w.code})</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={isSaveDisabled} className="cursor-pointer">
              <Save className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.saving") : editing ? t("common.update") : t("common.create")}
            </Button>
            <Button variant="outline" onClick={() => setFormOpen(false)} className="cursor-pointer">
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
            <DialogTitle>{t("settings.entities.confirmDelete")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("settings.entities.confirmDeleteDesc")} <strong>{deleteTarget?.name} ({deleteTarget?.code})</strong>?
          </p>
          <DialogFooter>
            <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting} className="cursor-pointer">
              <Trash2 className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.deleting") : t("common.delete")}
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="cursor-pointer">
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <EntitiesImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType={activeType}
        orgId={orgId}
        onComplete={() => { loadData(); loadLookups(); }}
      />
    </>
  );
}
