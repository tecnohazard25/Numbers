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
  Landmark,
  RefreshCw,
  Store,
  User,
  Users,
  Search,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  deleteSubjectAction,
  toggleSubjectAction,
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
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          {t("subjects.title")}
        </h1>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t("subjects.searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "all")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("subjects.type")}>
              {typeFilter === "all"
                ? t("subjects.allTypes")
                : TYPE_LABELS[typeFilter as SubjectType] ?? typeFilter}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("subjects.allTypes")}</SelectItem>
            <SelectItem value="person">{t("subjects.person")}</SelectItem>
            <SelectItem value="company">{t("subjects.company")}</SelectItem>
            <SelectItem value="sole_trader">{t("subjects.soleTrader")}</SelectItem>
            <SelectItem value="public_administration">{t("subjects.publicAdminShort")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tagFilter} onValueChange={(v) => setTagFilter(v ?? "all")}>
          <SelectTrigger className="w-48">
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
              <div className="flex gap-2 flex-wrap">
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
                  size="sm"
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
                  size="sm"
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
    </div>
  );
}
