"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
} from "lucide-react";
import {
  createEntityAction,
  updateEntityAction,
  deleteEntityAction,
  toggleEntityActiveAction,
} from "@/app/actions/entities";
import type { EntityType, Entity, EntityWithRelations } from "@/types/supabase";
import { useTranslation } from "@/lib/i18n/context";
import { DataGrid } from "@/components/data-grid";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
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

const ENTITY_TABS: { key: EntityType; icon: typeof Building2; labelKey: string }[] = [
  { key: "branch", icon: Building2, labelKey: "settings.entities.branch" },
  { key: "workplace", icon: MapPin, labelKey: "settings.entities.workplace" },
  { key: "room", icon: DoorOpen, labelKey: "settings.entities.room" },
  { key: "doctor", icon: Stethoscope, labelKey: "settings.entities.doctor" },
  { key: "activity", icon: Activity, labelKey: "settings.entities.activity" },
];

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
  // Workplace fields
  const [formAddress, setFormAddress] = useState("");
  // Room fields
  const [formWorkplaceId, setFormWorkplaceId] = useState("");
  // Doctor fields
  const [formDoctorBranchIds, setFormDoctorBranchIds] = useState<string[]>([]);
  const [formDoctorWorkplaceIds, setFormDoctorWorkplaceIds] = useState<string[]>([]);
  // Activity fields
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

  // Load entities
  const loadData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ orgId, type: activeType });
    if (showInactive) params.set("includeInactive", "true");
    const res = await fetch(`/api/entities?${params}`);
    const data = await res.json();
    setEntities(data.entities ?? []);
    setLoading(false);
  }, [orgId, activeType, showInactive]);

  // Load lookup data (branches and workplaces for form selects)
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

  // Refresh lookups when switching to types that need them
  useEffect(() => {
    if (activeType === "room" || activeType === "doctor" || activeType === "activity") {
      loadLookups();
    }
  }, [activeType, loadLookups]);

  function resetForm() {
    setFormName("");
    setFormCode("");
    setCodeManuallyEdited(false);
    setFormIsActive(true);
    setFormAddress("");
    setFormWorkplaceId("");
    setFormDoctorBranchIds([]);
    setFormDoctorWorkplaceIds([]);
    setFormActivityBranchId("");
    setFormActivityWorkplaceIds([]);
    setFormAvgSellingPrice("");
    setFormDurationMinutes("");
    setFormAvgCostLab("");
    setFormAvgCostStaff("");
    setFormAvgCostMaterials("");
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setFormOpen(true);
  }

  function openEdit(entity: EntityWithRelations) {
    setEditing(entity);
    setFormName(entity.name);
    setFormCode(entity.code);
    setCodeManuallyEdited(true);
    setFormIsActive(entity.is_active);
    setFormAddress(entity.workplace_address ?? "");
    setFormWorkplaceId(entity.room_workplace_id ?? "");
    setFormActivityBranchId(entity.activity_branch_id ?? "");
    setFormAvgSellingPrice(entity.activity_avg_selling_price?.toString() ?? "");
    setFormDurationMinutes(entity.activity_duration_minutes?.toString() ?? "");
    setFormAvgCostLab(entity.activity_avg_cost_lab?.toString() ?? "");
    setFormAvgCostStaff(entity.activity_avg_cost_staff?.toString() ?? "");
    setFormAvgCostMaterials(entity.activity_avg_cost_materials?.toString() ?? "");
    // Junction data
    setFormDoctorBranchIds(
      entity.entity_doctor_branches?.map((j) => j.branch_id) ?? []
    );
    setFormDoctorWorkplaceIds(
      entity.entity_doctor_workplaces?.map((j) => j.workplace_id) ?? []
    );
    setFormActivityWorkplaceIds(
      entity.entity_activity_workplaces?.map((j) => j.workplace_id) ?? []
    );
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
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(t("settings.entities.updated"));
        setFormOpen(false);
        loadData();
        loadLookups();
      }
    } else {
      const result = await createEntityAction(inputData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(t("settings.entities.created"));
        setFormOpen(false);
        loadData();
        loadLookups();
      }
    }
    setIsSubmitting(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    const result = await deleteEntityAction(deleteTarget.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      if (result.softDeleted) {
        toast.success(t("settings.entities.deactivatedMsg"));
      } else {
        toast.success(t("settings.entities.deleted"));
      }
      setDeleteTarget(null);
      loadData();
      loadLookups();
    }
    setIsSubmitting(false);
  }

  async function handleToggleActive(entity: EntityWithRelations) {
    setIsSubmitting(true);
    const result = await toggleEntityActiveAction(entity.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.is_active ? t("settings.entities.reactivated") : t("settings.entities.deactivatedMsg"));
      loadData();
    }
    setIsSubmitting(false);
  }

  // Column definitions per type
  const columnDefs = useMemo((): ColDef<EntityWithRelations>[] => {
    const actionsCellRenderer = (params: ICellRendererParams<EntityWithRelations>) => {
      if (!params.data) return null;
      const entity = params.data;
      return (
        <div className="flex items-center gap-1">
          <button type="button" className="p-1 hover:bg-muted rounded cursor-pointer" onClick={() => openEdit(entity)}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="p-1 hover:bg-muted rounded cursor-pointer"
            onClick={() => handleToggleActive(entity)}
            title={entity.is_active ? t("common.deactivate") : t("common.reactivate")}
          >
            {entity.is_active ? <PowerOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Power className="h-3.5 w-3.5 text-green-600" />}
          </button>
          <button type="button" className="p-1 hover:bg-muted rounded cursor-pointer" onClick={() => setDeleteTarget(entity)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </button>
        </div>
      );
    };

    const statusCellRenderer = (params: ICellRendererParams<EntityWithRelations>) => {
      if (!params.data) return null;
      return (
        <Badge variant={params.data.is_active ? "default" : "secondary"}>
          {params.data.is_active ? t("common.active") : t("common.inactive")}
        </Badge>
      );
    };

    const baseCols: ColDef<EntityWithRelations>[] = [
      { headerName: t("settings.entities.code"), field: "code", width: 120, sort: "asc" },
      { headerName: t("settings.entities.name"), field: "name", flex: 1, minWidth: 150 },
    ];

    const statusCol: ColDef<EntityWithRelations> = {
      headerName: t("common.status"),
      field: "is_active",
      width: 110,
      cellRenderer: statusCellRenderer,
    };

    const actionsCol: ColDef<EntityWithRelations> = {
      headerName: t("common.actions"),
      width: 120,
      sortable: false,
      filter: false,
      cellRenderer: actionsCellRenderer,
    };

    switch (activeType) {
      case "branch":
        return [...baseCols, statusCol, actionsCol];

      case "workplace":
        return [
          ...baseCols,
          { headerName: t("settings.entities.address"), field: "workplace_address", flex: 1, minWidth: 150 },
          statusCol,
          actionsCol,
        ];

      case "room":
        return [
          ...baseCols,
          {
            headerName: t("settings.entities.workplaceSede"),
            width: 180,
            valueGetter: (params) => {
              const wp = (params.data as EntityWithRelations)?.room_workplace;
              return wp ? wp.name : "";
            },
          },
          statusCol,
          actionsCol,
        ];

      case "doctor":
        return [
          ...baseCols,
          {
            headerName: t("settings.entities.branches"),
            flex: 1,
            minWidth: 150,
            cellRenderer: (params: ICellRendererParams<EntityWithRelations>) => {
              const branches = params.data?.entity_doctor_branches;
              if (!branches?.length) return null;
              return (
                <div className="flex flex-wrap gap-1">
                  {branches.map((b) => (
                    <Badge key={b.branch_id} variant="outline" className="text-xs">
                      {b.entities?.name}
                    </Badge>
                  ))}
                </div>
              );
            },
          },
          {
            headerName: t("settings.entities.workplaces"),
            flex: 1,
            minWidth: 150,
            cellRenderer: (params: ICellRendererParams<EntityWithRelations>) => {
              const wps = params.data?.entity_doctor_workplaces;
              if (!wps?.length) return null;
              return (
                <div className="flex flex-wrap gap-1">
                  {wps.map((w) => (
                    <Badge key={w.workplace_id} variant="outline" className="text-xs">
                      {w.entities?.name}
                    </Badge>
                  ))}
                </div>
              );
            },
          },
          statusCol,
          actionsCol,
        ];

      case "activity":
        return [
          ...baseCols,
          {
            headerName: t("settings.entities.selectBranch"),
            width: 150,
            valueGetter: (params) => {
              const br = (params.data as EntityWithRelations)?.activity_branch;
              return br ? br.name : "";
            },
          },
          {
            headerName: t("settings.entities.duration"),
            field: "activity_duration_minutes",
            width: 100,
            valueFormatter: (params) => params.value ? `${params.value} ${t("settings.entities.min")}` : "",
          },
          {
            headerName: t("settings.entities.price"),
            field: "activity_avg_selling_price",
            width: 110,
            valueFormatter: (params) => params.value != null ? `€ ${Number(params.value).toFixed(2)}` : "",
          },
          {
            headerName: t("settings.entities.workplaces"),
            flex: 1,
            minWidth: 150,
            cellRenderer: (params: ICellRendererParams<EntityWithRelations>) => {
              const wps = params.data?.entity_activity_workplaces;
              if (!wps?.length) return null;
              return (
                <div className="flex flex-wrap gap-1">
                  {wps.map((w) => (
                    <Badge key={w.workplace_id} variant="outline" className="text-xs">
                      {w.entities?.name}
                    </Badge>
                  ))}
                </div>
              );
            },
          },
          statusCol,
          actionsCol,
        ];

      default:
        return [...baseCols, statusCol, actionsCol];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, t, allBranches, allWorkplaces]);

  // Mobile card renderer
  const renderMobileCard = useCallback(
    (entity: EntityWithRelations, index: number) => (
      <div
        key={entity.id}
        className={`rounded-lg border px-4 py-3 space-y-2 ${!entity.is_active ? "opacity-50" : ""}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-sm bg-muted px-2 py-0.5 rounded shrink-0">{entity.code}</span>
            <span className="font-medium text-sm truncate">{entity.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" className="p-1 hover:bg-muted rounded cursor-pointer" onClick={() => openEdit(entity)}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="p-1 hover:bg-muted rounded cursor-pointer" onClick={() => handleToggleActive(entity)}>
              {entity.is_active ? <PowerOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Power className="h-3.5 w-3.5 text-green-600" />}
            </button>
            <button type="button" className="p-1 hover:bg-muted rounded cursor-pointer" onClick={() => setDeleteTarget(entity)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
          </div>
        </div>
        {activeType === "workplace" && entity.workplace_address && (
          <p className="text-xs text-muted-foreground">{entity.workplace_address}</p>
        )}
        {activeType === "room" && entity.room_workplace && (
          <p className="text-xs text-muted-foreground">{t("settings.entities.workplaceSede")}: {entity.room_workplace.name}</p>
        )}
        {activeType === "doctor" && (
          <div className="flex flex-wrap gap-1">
            {entity.entity_doctor_branches?.map((b) => (
              <Badge key={b.branch_id} variant="outline" className="text-xs">{b.entities?.name}</Badge>
            ))}
          </div>
        )}
        {activeType === "activity" && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {entity.activity_duration_minutes && <span>{entity.activity_duration_minutes} {t("settings.entities.min")}</span>}
            {entity.activity_avg_selling_price != null && <span>€ {Number(entity.activity_avg_selling_price).toFixed(2)}</span>}
          </div>
        )}
        <Badge variant={entity.is_active ? "default" : "secondary"} className="text-xs">
          {entity.is_active ? t("common.active") : t("common.inactive")}
        </Badge>
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeType, t]
  );

  const isSaveDisabled = isSubmitting || !formName.trim() || !formCode.trim() ||
    (activeType === "room" && !formWorkplaceId);

  function toggleMultiSelect(id: string, current: string[], setter: (v: string[]) => void) {
    if (current.includes(id)) {
      setter(current.filter((x) => x !== id));
    } else {
      setter([...current, id]);
    }
  }

  if (loading && entities.length === 0) {
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
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b mb-4">
        {ENTITY_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeType === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              onClick={() => setActiveType(tab.key)}
            >
              <Icon className="h-4 w-4" />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {/* DataGrid */}
      <DataGrid<EntityWithRelations>
        gridId={`entities-${activeType}`}
        exportFileName={`entities-${activeType}`}
        columnDefs={columnDefs}
        rowData={entities}
        onCreate={openCreate}
        onEdit={openEdit}
        onDelete={(rows) => rows.length === 1 && setDeleteTarget(rows[0])}
        renderMobileCard={renderMobileCard}
        importItems={[
          {
            label: t("settings.entities.import.importButton"),
            onClick: () => setImportOpen(true),
          },
        ]}
      />

      {/* Show inactive toggle below grid */}
      <div className="flex items-center justify-end mt-2">
        <Button
          variant={showInactive ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowInactive(!showInactive)}
          className="cursor-pointer"
        >
          {showInactive ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
          {showInactive ? t("settings.entities.hideInactive") : t("settings.entities.showInactive")}
        </Button>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t(EDIT_TITLE_KEYS[activeType]) : t(NEW_TITLE_KEYS[activeType])}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Common fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("settings.entities.name")}</Label>
                <Input
                  value={formName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={t("settings.entities.namePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.entities.code")}</Label>
                <Input
                  value={formCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder={t("settings.entities.codePlaceholder")}
                />
              </div>
            </div>

            {/* Workplace: address */}
            {activeType === "workplace" && (
              <div className="space-y-2">
                <Label>{t("settings.entities.address")}</Label>
                <Input
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder={t("settings.entities.addressPlaceholder")}
                />
              </div>
            )}

            {/* Room: workplace select */}
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
                      <SelectItem key={w.id} value={w.id} className="cursor-pointer">
                        {w.name} ({w.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Doctor: branches multi-select */}
            {activeType === "doctor" && (
              <>
                <div className="space-y-2">
                  <Label>{t("settings.entities.branches")}</Label>
                  <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                    {allBranches.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("settings.entities.noBranches")}</p>
                    ) : (
                      allBranches.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-1 py-0.5">
                          <input
                            type="checkbox"
                            checked={formDoctorBranchIds.includes(b.id)}
                            onChange={() => toggleMultiSelect(b.id, formDoctorBranchIds, setFormDoctorBranchIds)}
                            className="cursor-pointer"
                          />
                          {b.name} <span className="text-muted-foreground">({b.code})</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.entities.workplaces")}</Label>
                  <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                    {allWorkplaces.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("settings.entities.noWorkplaces")}</p>
                    ) : (
                      allWorkplaces.map((w) => (
                        <label key={w.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-1 py-0.5">
                          <input
                            type="checkbox"
                            checked={formDoctorWorkplaceIds.includes(w.id)}
                            onChange={() => toggleMultiSelect(w.id, formDoctorWorkplaceIds, setFormDoctorWorkplaceIds)}
                            className="cursor-pointer"
                          />
                          {w.name} <span className="text-muted-foreground">({w.code})</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Activity: branch select + costs + workplaces */}
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
                        <SelectItem key={b.id} value={b.id} className="cursor-pointer">
                          {b.name} ({b.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("settings.entities.avgSellingPrice")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formAvgSellingPrice}
                      onChange={(e) => setFormAvgSellingPrice(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settings.entities.durationMinutes")}</Label>
                    <Input
                      type="number"
                      value={formDurationMinutes}
                      onChange={(e) => setFormDurationMinutes(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t("settings.entities.avgCostLab")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formAvgCostLab}
                      onChange={(e) => setFormAvgCostLab(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settings.entities.avgCostStaff")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formAvgCostStaff}
                      onChange={(e) => setFormAvgCostStaff(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settings.entities.avgCostMaterials")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formAvgCostMaterials}
                      onChange={(e) => setFormAvgCostMaterials(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.entities.workplaces")}</Label>
                  <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                    {allWorkplaces.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("settings.entities.noWorkplaces")}</p>
                    ) : (
                      allWorkplaces.map((w) => (
                        <label key={w.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-1 py-0.5">
                          <input
                            type="checkbox"
                            checked={formActivityWorkplaceIds.includes(w.id)}
                            onChange={() => toggleMultiSelect(w.id, formActivityWorkplaceIds, setFormActivityWorkplaceIds)}
                            className="cursor-pointer"
                          />
                          {w.name} <span className="text-muted-foreground">({w.code})</span>
                        </label>
                      ))
                    )}
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
        onComplete={() => {
          loadData();
          loadLookups();
        }}
      />
    </>
  );
}
