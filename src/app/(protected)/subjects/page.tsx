"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Ban,
  RefreshCw,
  Users,
  Search,
} from "lucide-react";
import {
  deleteSubjectAction,
  toggleSubjectAction,
} from "@/app/actions/subjects";
import type { SubjectWithDetails, Tag, SubjectType } from "@/types/supabase";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

const TYPE_LABELS: Record<SubjectType, string> = {
  person: "Persona fisica",
  company: "Azienda",
  sole_trader: "Ditta individuale",
  public_administration: "P.A.",
};

const TYPE_COLORS: Record<SubjectType, string> = {
  person: "default",
  company: "secondary",
  sole_trader: "outline",
  public_administration: "destructive",
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
  const router = useRouter();
  const [subjects, setSubjects] = useState<SubjectWithDetails[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SubjectWithDetails | null>(null);

  const loadData = useCallback(async () => {
    try {
      const userRes = await fetch("/api/user-info");
      const userData = await userRes.json();
      const orgId = userData.profile?.organization_id;
      const roles: string[] = userData.roles ?? [];

      setCanWrite(
        roles.includes("superadmin") || roles.includes("org_admin")
      );

      if (!orgId) {
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({ orgId });
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (searchText) params.set("search", searchText);
      if (tagFilter !== "all") params.set("tagId", tagFilter);

      const res = await fetch(`/api/subjects?${params}`);
      const data = await res.json();
      setSubjects(data.subjects ?? []);
      setTags(data.tags ?? []);
    } catch {
      toast.error("Errore nel caricamento dei dati");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, tagFilter, searchText]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = async (subject: SubjectWithDetails) => {
    const result = await toggleSubjectAction(subject.id, !subject.is_active);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(
        subject.is_active ? "Soggetto disattivato" : "Soggetto riattivato"
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
      toast.success("Soggetto eliminato");
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      loadData();
    }
  };

  const columnDefs = useMemo<ColDef<SubjectWithDetails>[]>(
    () => [
      {
        headerName: "Nome",
        valueGetter: (params) =>
          params.data ? getSubjectName(params.data) : "",
        filter: "agTextColumnFilter",
        minWidth: 180,
      },
      {
        headerName: "Tipo",
        field: "type",
        filter: "agTextColumnFilter",
        minWidth: 130,
        cellRenderer: (params: ICellRendererParams<SubjectWithDetails>) => {
          if (!params.data) return null;
          return (
            <Badge
              variant={TYPE_COLORS[params.data.type] as "default" | "secondary" | "outline" | "destructive"}
            >
              {TYPE_LABELS[params.data.type]}
            </Badge>
          );
        },
        valueFormatter: (params) =>
          params.value ? TYPE_LABELS[params.value as SubjectType] : "",
      },
      {
        headerName: "Indirizzo",
        valueGetter: (params) =>
          params.data ? getPrimaryAddress(params.data) : "",
        filter: "agTextColumnFilter",
        minWidth: 200,
      },
      {
        headerName: "Contatti",
        valueGetter: (params) =>
          params.data ? getPrimaryContact(params.data) : "",
        filter: "agTextColumnFilter",
        minWidth: 200,
      },
      {
        headerName: "Data di nascita",
        field: "birth_date",
        filter: "agTextColumnFilter",
        minWidth: 120,
        valueFormatter: (params) => {
          if (!params.data || params.data.type !== "person" || !params.value)
            return "";
          return new Date(params.value).toLocaleDateString("it-IT");
        },
      },
      {
        headerName: "Tag",
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
              headerName: "Azioni",
              sortable: false,
              filter: false,
              resizable: false,
              floatingFilter: false,
              minWidth: 200,
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
                      onClick={() => router.push(`/subjects/${s.id}/edit`)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Modifica
                    </Button>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDeleteTarget(s);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                );
              },
            } as ColDef<SubjectWithDetails>,
          ]
        : []),
    ],
    [canWrite, router]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Soggetti
        </h1>
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Soggetti
        </h1>
        {canWrite && (
          <Button onClick={() => router.push("/subjects/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Soggetto
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Cerca per nome, ragione sociale, CF, P.IVA..."
            className="pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "all")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tipi</SelectItem>
            <SelectItem value="person">Persona fisica</SelectItem>
            <SelectItem value="company">Azienda</SelectItem>
            <SelectItem value="sole_trader">Ditta individuale</SelectItem>
            <SelectItem value="public_administration">P.A.</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tagFilter} onValueChange={(v) => setTagFilter(v ?? "all")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tag</SelectItem>
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
        exportFileName="soggetti"
        renderMobileCard={(subject) => (
          <div key={subject.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{getSubjectName(subject)}</span>
              <Badge
                variant={TYPE_COLORS[subject.type] as "default" | "secondary" | "outline" | "destructive"}
              >
                {TYPE_LABELS[subject.type]}
              </Badge>
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
                Nato il{" "}
                {new Date(subject.birth_date).toLocaleDateString("it-IT")}
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
                  onClick={() => router.push(`/subjects/${subject.id}/edit`)}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Modifica
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

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferma Eliminazione</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Sei sicuro di voler eliminare{" "}
            <strong>
              {deleteTarget ? getSubjectName(deleteTarget) : ""}
            </strong>
            ? Questa azione non può essere annullata.
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              Elimina
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
