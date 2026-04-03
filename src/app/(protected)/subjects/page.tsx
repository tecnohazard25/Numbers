"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { DataGrid } from "@/components/data-grid";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Ban,
  Building2,
  GitMerge,
  Landmark,
  RefreshCw,
  Store,
  Star,
  User,
  Users,
  Search,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  deleteSubjectAction,
  toggleSubjectAction,
  mergeSubjectsAction,
} from "@/app/actions/subjects";
import { SubjectForm } from "./_components/subject-form";
import { useTranslation } from "@/lib/i18n/context";
import type { SubjectWithDetails, Tag, SubjectType } from "@/types/supabase";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

const TYPE_ICONS: Record<SubjectType, React.ComponentType<{ className?: string }>> = {
  person: User,
  company: Building2,
  sole_trader: Store,
  public_administration: Landmark,
};

function getSubjectName(s: SubjectWithDetails): string {
  if (s.type === "person") {
    return `${s.last_name ?? ""} ${s.first_name ?? ""}`.trim();
  }
  return s.business_name ?? "";
}

function getPrimaryAddress(s: SubjectWithDetails): string {
  const addr =
    s.subject_addresses?.find((a) => a.is_primary) ??
    s.subject_addresses?.[0];
  if (!addr) return "";
  const parts = [addr.street, addr.city];
  if (addr.province) parts.push(`(${addr.province})`);
  return parts.filter(Boolean).join(", ");
}

function getPrimaryContact(s: SubjectWithDetails): string {
  const mobile = s.subject_contacts?.find(
    (c) => c.type === "mobile" && c.is_primary
  );
  const email = s.subject_contacts?.find(
    (c) => c.type === "email" && c.is_primary
  );
  const parts: string[] = [];
  if (mobile) parts.push(mobile.value);
  if (email) parts.push(email.value);
  if (parts.length === 0) {
    const first = s.subject_contacts?.[0];
    if (first) parts.push(first.value);
  }
  return parts.join(" | ");
}

export default function SubjectsPage() {
  const { t, locale } = useTranslation();
  const [subjects, setSubjects] = useState<SubjectWithDetails[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  // Form dialog
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [formSubject, setFormSubject] = useState<SubjectWithDetails | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SubjectWithDetails | null>(null);

  // Similar subjects
  interface SimilarGroup {
    key: string;
    reason: string;
    subjects: SubjectWithDetails[];
  }
  const [similarDialogOpen, setSimilarDialogOpen] = useState(false);
  const [similarGroups, setSimilarGroups] = useState<SimilarGroup[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<Record<string, string>>({}); // groupKey -> masterId
  const [isMerging, setIsMerging] = useState(false);

  const TYPE_LABELS: Record<SubjectType, string> = useMemo(() => ({
    person: t("subjects.person"),
    company: t("subjects.company"),
    sole_trader: t("subjects.soleTrader"),
    public_administration: t("subjects.publicAdminShort"),
  }), [t]);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      const userRes = await fetch("/api/user-info", { signal });
      const userData = await userRes.json();
      const orgId = userData.profile?.organization_id;
      const roles: string[] = userData.roles ?? [];

      setCanWrite(
        roles.includes("superadmin") || roles.includes("user_manager")
      );

      if (!orgId) {
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({ orgId });
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (searchText) params.set("search", searchText);
      if (tagFilter !== "all") params.set("tagId", tagFilter);

      const res = await fetch(`/api/subjects?${params}`, { signal });
      const data = await res.json();
      setSubjects(data.subjects ?? []);
      setTags(data.tags ?? []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("Errore nel caricamento dei dati");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, tagFilter, searchText]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const handleToggle = async (subject: SubjectWithDetails) => {
    const result = await toggleSubjectAction(subject.id, !subject.is_active);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(
        subject.is_active ? t("subjects.deactivated") : t("subjects.reactivated")
      );
      loadData();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteSubjectAction(deleteTarget.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("subjects.deleted"));
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      loadData();
    }
  };

  const openNewForm = () => {
    setFormSubject(null);
    setFormDialogOpen(true);
  };

  const openEditForm = async (subject: SubjectWithDetails) => {
    setFormLoading(true);
    setFormDialogOpen(true);
    try {
      const res = await fetch(`/api/subjects/${subject.id}`);
      if (res.ok) {
        const data = await res.json();
        setFormSubject(data.subject);
      } else {
        toast.error(t("subjects.subjectNotFound"));
        setFormDialogOpen(false);
      }
    } catch {
      toast.error(t("subjects.loadError"));
      setFormDialogOpen(false);
    } finally {
      setFormLoading(false);
    }
  };

  const handleFormSuccess = () => {
    setFormDialogOpen(false);
    setFormSubject(null);
    loadData();
  };

  const handleFormClose = () => {
    setFormDialogOpen(false);
    setFormSubject(null);
  };

  const handleFindSimilar = async () => {
    setSimilarLoading(true);
    setSimilarDialogOpen(true);
    try {
      const userRes = await fetch("/api/user-info");
      const userData = await userRes.json();
      const orgId = userData.profile?.organization_id;
      if (!orgId) return;
      const res = await fetch(`/api/subjects/similar?orgId=${orgId}`);
      const data = await res.json();
      setSimilarGroups(data.groups ?? []);
      // Auto-select first subject as master for each group
      const selection: Record<string, string> = {};
      for (const g of data.groups ?? []) {
        if (g.subjects.length > 0) selection[g.key] = g.subjects[0].id;
      }
      setMergeSelection(selection);
    } catch {
      toast.error(t("subjects.loadError"));
    } finally {
      setSimilarLoading(false);
    }
  };

  const handleMergeGroup = async (group: SimilarGroup) => {
    const masterId = mergeSelection[group.key];
    if (!masterId) return;
    setIsMerging(true);
    const dupIds = group.subjects.filter((s) => s.id !== masterId).map((s) => s.id);
    const result = await mergeSubjectsAction(masterId, dupIds);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("subjects.mergeSuccess"));
      // Remove merged group from list
      setSimilarGroups((prev) => prev.filter((g) => g.key !== group.key));
      loadData();
    }
    setIsMerging(false);
  };

  const handleMergeAll = async () => {
    setIsMerging(true);
    for (const group of similarGroups) {
      const masterId = mergeSelection[group.key];
      if (!masterId) continue;
      const dupIds = group.subjects.filter((s) => s.id !== masterId).map((s) => s.id);
      const result = await mergeSubjectsAction(masterId, dupIds);
      if (result.error) {
        toast.error(`${group.key}: ${result.error}`);
      }
    }
    toast.success(t("subjects.mergeSuccess"));
    setSimilarGroups([]);
    setSimilarDialogOpen(false);
    loadData();
    setIsMerging(false);
  };

  const columnDefs = useMemo<ColDef<SubjectWithDetails>[]>(
    () => [
      {
        headerName: t("common.name"),
        valueGetter: (params) =>
          params.data ? getSubjectName(params.data) : "",
        filter: "agTextColumnFilter",
        minWidth: 180,
      },
      {
        headerName: "C.F. / P.IVA",
        valueGetter: (params) => {
          if (!params.data) return "";
          return params.data.type === "person"
            ? params.data.tax_code ?? ""
            : params.data.vat_number ?? "";
        },
        filter: "agTextColumnFilter",
        minWidth: 160,
      },
      {
        headerName: t("subjects.type"),
        field: "type",
        filter: "agTextColumnFilter",
        minWidth: 80,
        maxWidth: 100,
        cellRenderer: (params: ICellRendererParams<SubjectWithDetails>) => {
          if (!params.data) return null;
          const Icon = TYPE_ICONS[params.data.type];
          const label = TYPE_LABELS[params.data.type];
          return (
            <div className="flex items-center justify-center h-full">
              <Tooltip>
                <TooltipTrigger render={
                  <span className="inline-flex items-center justify-center">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </span>
                } />
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            </div>
          );
        },
        valueFormatter: (params) =>
          params.value ? TYPE_LABELS[params.value as SubjectType] : "",
      },
      {
        headerName: t("subjects.address"),
        valueGetter: (params) =>
          params.data ? getPrimaryAddress(params.data) : "",
        filter: "agTextColumnFilter",
        minWidth: 200,
      },
      {
        headerName: t("subjects.contactsColumn"),
        valueGetter: (params) =>
          params.data ? getPrimaryContact(params.data) : "",
        filter: "agTextColumnFilter",
        minWidth: 200,
      },
      {
        headerName: t("subjects.birthDate"),
        field: "birth_date",
        filter: "agTextColumnFilter",
        minWidth: 120,
        valueFormatter: (params) => {
          if (!params.data || params.data.type !== "person" || !params.value)
            return "";
          return new Date(params.value).toLocaleDateString(locale);
        },
      },
      {
        headerName: t("subjects.tags"),
        valueGetter: (params) =>
          params.data?.subject_tags
            ?.map((st) => st.tags?.name)
            .filter(Boolean)
            .join(", ") ?? "",
        filter: "agTextColumnFilter",
        minWidth: 150,
        cellRenderer: (params: ICellRendererParams<SubjectWithDetails>) => {
          if (!params.data?.subject_tags?.length) return null;
          return (
            <div className="flex gap-1 flex-wrap items-center h-full">
              {params.data.subject_tags.map((st) =>
                st.tags ? (
                  <Badge
                    key={st.tag_id}
                    style={{ backgroundColor: st.tags.color, color: "#fff" }}
                    className="text-xs"
                  >
                    {st.tags.name}
                  </Badge>
                ) : null
              )}
            </div>
          );
        },
      },
      ...(canWrite
        ? [
            {
              headerName: t("common.active"),
              sortable: false,
              filter: false,
              resizable: false,
              floatingFilter: false,
              minWidth: 80,
              cellRenderer: (
                params: ICellRendererParams<SubjectWithDetails>
              ) => {
                if (!params.data) return null;
                const s = params.data;
                return (
                  <div className="flex items-center gap-1 h-full">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggle(s)}
                    >
                      {s.is_active ? (
                        <Ban className="h-3 w-3" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                );
              },
            } as ColDef<SubjectWithDetails>,
          ]
        : []),
    ],
    [canWrite, t, locale, TYPE_LABELS]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          {t("subjects.title")}
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
          <Users className="h-6 w-6" />
          {t("subjects.title")}
        </h1>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t("subjects.searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <div className="flex gap-2 sm:contents">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "all")}>
            <SelectTrigger className="flex-1 sm:w-48">
              <SelectValue placeholder={t("subjects.type")}>
                {typeFilter === "all"
                  ? t("subjects.allTypes")
                  : (() => { const Icon = TYPE_ICONS[typeFilter as SubjectType]; return (
                    <span className="flex items-center gap-1.5">
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {TYPE_LABELS[typeFilter as SubjectType] ?? typeFilter}
                    </span>
                  ); })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("subjects.allTypes")}</SelectItem>
              {(Object.keys(TYPE_ICONS) as SubjectType[]).map((st) => {
                const Icon = TYPE_ICONS[st];
                return (
                  <SelectItem key={st} value={st}>
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {TYPE_LABELS[st]}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Select value={tagFilter} onValueChange={(v) => setTagFilter(v ?? "all")}>
            <SelectTrigger className="flex-1 sm:w-48">
              <SelectValue placeholder={t("subjects.tags")}>
                {tagFilter === "all"
                  ? t("subjects.allTags")
                  : tags.find((tg) => tg.id === tagFilter)?.name ?? tagFilter}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("subjects.allTags")}</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canWrite && (
          <Button variant="outline" size="sm" onClick={handleFindSimilar} className="shrink-0">
            <GitMerge className="h-4 w-4 mr-1" />
            {t("subjects.findSimilar")}
          </Button>
        )}
      </div>

      {/* Grid */}
      <DataGrid
        rowData={subjects}
        columnDefs={columnDefs}
        onCreate={canWrite ? openNewForm : undefined}
        onEdit={canWrite ? (s) => openEditForm(s) : undefined}
        onDelete={canWrite ? (selected) => {
          setDeleteTarget(selected[0]);
          setDeleteDialogOpen(true);
        } : undefined}
        exportFileName="soggetti"
        renderMobileCard={(subject) => (
          <div key={subject.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{getSubjectName(subject)}</span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {(() => { const Icon = TYPE_ICONS[subject.type]; return <Icon className="h-4 w-4" />; })()}
                {TYPE_LABELS[subject.type]}
              </span>
            </div>
            {getPrimaryAddress(subject) && (
              <div className="text-sm text-muted-foreground">
                {getPrimaryAddress(subject)}
              </div>
            )}
            {getPrimaryContact(subject) && (
              <div className="text-sm text-muted-foreground">
                {getPrimaryContact(subject)}
              </div>
            )}
            {subject.type === "person" && subject.birth_date && (
              <div className="text-sm text-muted-foreground">
                {t("subjects.bornOn")}{" "}
                {new Date(subject.birth_date).toLocaleDateString(locale)}
              </div>
            )}
            {subject.subject_tags?.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {subject.subject_tags.map((st) =>
                  st.tags ? (
                    <Badge
                      key={st.tag_id}
                      style={{
                        backgroundColor: st.tags.color,
                        color: "#fff",
                      }}
                      className="text-xs"
                    >
                      {st.tags.name}
                    </Badge>
                  ) : null
                )}
              </div>
            )}
            {canWrite && (
              <div className="flex gap-1.5 items-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => openEditForm(subject)}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  {t("common.edit")}
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => handleToggle(subject)}
                >
                  {subject.is_active ? (
                    <Ban className="h-3 w-3" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setDeleteTarget(subject);
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

      {/* Form dialog (new / edit) */}
      <Dialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleFormClose();
        }}
      >
        <DialogContent
          className="sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>
              {formSubject
                ? t("subjects.editSubject")
                : t("subjects.newSubject")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {formSubject
                ? t("subjects.editSubject")
                : t("subjects.newSubject")}
            </DialogDescription>
          </DialogHeader>
          {formLoading ? (
            <p className="text-muted-foreground text-center py-8">
              {t("common.loading")}
            </p>
          ) : (
            <SubjectForm
              key={formSubject?.id ?? "new"}
              initialData={formSubject ?? undefined}
              tags={tags}
              isDialog
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
            <DialogTitle>{t("subjects.confirmDelete")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("subjects.confirmDeleteDesc")}{" "}
            <strong>
              {deleteTarget ? getSubjectName(deleteTarget) : ""}
            </strong>
            ? {t("subjects.cannotBeUndone")}
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Similar subjects dialog */}
      <Dialog open={similarDialogOpen} onOpenChange={setSimilarDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" showCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5" />
              {t("subjects.similarSubjectsTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("subjects.similarSubjectsDesc")}
            </DialogDescription>
          </DialogHeader>

          {similarLoading ? (
            <p className="text-muted-foreground text-center py-8">{t("common.loading")}</p>
          ) : similarGroups.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t("subjects.noSimilarFound")}</p>
          ) : (
            <div className="space-y-4">
              {/* Merge all button */}
              <div className="flex justify-end">
                <Button size="sm" onClick={handleMergeAll} disabled={isMerging}>
                  <GitMerge className="h-4 w-4 mr-1" />
                  {isMerging ? t("common.saving") : t("subjects.mergeAll")} ({similarGroups.length})
                </Button>
              </div>

              {similarGroups.map((group) => {
                const reasonLabel = group.reason === "tax_code"
                  ? t("subjects.sameTC")
                  : group.reason === "vat_number"
                    ? t("subjects.sameVAT")
                    : t("subjects.sameName");

                return (
                  <div key={group.key} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{reasonLabel}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {group.subjects.length} {t("subjects.subjectsCount")}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleMergeGroup(group)}
                        disabled={isMerging}
                      >
                        <GitMerge className="h-3.5 w-3.5 mr-1" />
                        {t("subjects.merge")}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {group.subjects.map((subject) => {
                        const isMaster = mergeSelection[group.key] === subject.id;
                        const Icon = TYPE_ICONS[subject.type];
                        return (
                          <div
                            key={subject.id}
                            className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                              isMaster
                                ? "bg-primary/10 border-2 border-primary"
                                : "bg-muted/30 border-2 border-transparent hover:bg-muted/50"
                            }`}
                            onClick={() => setMergeSelection((prev) => ({ ...prev, [group.key]: subject.id }))}
                          >
                            <Star className={`h-4 w-4 shrink-0 ${isMaster ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30"}`} />
                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{getSubjectName(subject)}</div>
                              <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                                {subject.tax_code && <span>CF: {subject.tax_code}</span>}
                                {subject.vat_number && <span>P.IVA: {subject.vat_number}</span>}
                                {getPrimaryContact(subject) && <span>{getPrimaryContact(subject)}</span>}
                              </div>
                            </div>
                            {isMaster && (
                              <Badge variant="default" className="shrink-0 text-xs">
                                {t("subjects.master")}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
