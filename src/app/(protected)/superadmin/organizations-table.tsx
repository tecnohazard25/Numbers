"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Organization } from "@/types/supabase";
import {
  toggleOrganizationAction,
  deleteOrganizationAction,
  renameOrganizationAction,
  updateOrganizationSettingsAction,
} from "@/app/actions/organizations";
import { DataGrid } from "@/components/data-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Settings, Ban, RefreshCw, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/context";
import { CURRENCIES } from "@/lib/locale-defaults";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

interface Props {
  organizations: Organization[];
  onCreate?: () => void;
  onRefresh: () => void;
}

export function OrganizationsTable({ organizations, onCreate, onRefresh }: Props) {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [deleteOrgs, setDeleteOrgs] = useState<Organization[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit state
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [editName, setEditName] = useState("");
  const [editCurrency, setEditCurrency] = useState("EUR");
  const [isSaving, setIsSaving] = useState(false);

  function openEditDialog(org: Organization) {
    setEditOrg(org);
    setEditName(org.name);
    setEditCurrency(org.currency ?? "EUR");
  }

  async function handleSaveEdit() {
    if (!editOrg || !editName.trim()) return;
    setIsSaving(true);

    // Rename if changed
    if (editName.trim() !== editOrg.name) {
      const renameResult = await renameOrganizationAction(editOrg.id, editName.trim());
      if (renameResult.error) {
        toast.error(renameResult.error);
        setIsSaving(false);
        return;
      }
    }

    // Update currency if changed
    if (editCurrency !== (editOrg.currency ?? "EUR")) {
      const settingsResult = await updateOrganizationSettingsAction(editOrg.id, {
        currency: editCurrency,
      });
      if (settingsResult.error) {
        toast.error(settingsResult.error);
        setIsSaving(false);
        return;
      }
    }

    toast.success(t("orgs.settingsSaved"));
    setEditOrg(null);
    onRefresh();
    setIsSaving(false);
  }

  async function handleToggle(orgId: string, currentActive: boolean) {
    const result = await toggleOrganizationAction(orgId, !currentActive);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(
        currentActive ? t("orgs.deactivated") : t("orgs.reactivated")
      );
      onRefresh();
    }
  }

  async function handleDelete() {
    if (deleteOrgs.length === 0) return;
    setIsDeleting(true);
    let hasError = false;
    for (const org of deleteOrgs) {
      const result = await deleteOrganizationAction(org.id);
      if (result.error) {
        toast.error(`${org.name}: ${result.error}`);
        hasError = true;
      }
    }
    if (!hasError) {
      toast.success(t("orgs.deleted"));
    }
    onRefresh();
    setIsDeleting(false);
    setDeleteOrgs([]);
  }

  const columnDefs = useMemo<ColDef<Organization>[]>(
    () => [
      {
        headerName: t("common.name"),
        field: "name",
        filter: "agTextColumnFilter",
      },
      {
        headerName: t("orgs.currency"),
        field: "currency",
        filter: "agTextColumnFilter",
        maxWidth: 120,
      },
      {
        headerName: t("common.status"),
        field: "is_active",
        filter: "agTextColumnFilter",
        cellRenderer: (params: ICellRendererParams<Organization>) => {
          if (params.value == null) return null;
          return params.value ? t("common.activeF") : t("common.inactiveF");
        },
        valueFormatter: (params) => (params.value ? t("common.activeF") : t("common.inactiveF")),
      },
      {
        headerName: t("orgs.createdOn"),
        field: "created_at",
        filter: "agDateColumnFilter",
        valueFormatter: (params) =>
          params.value
            ? new Date(params.value).toLocaleDateString(locale)
            : "",
      },
      {
        headerName: t("common.actions"),
        sortable: false,
        filter: false,
        resizable: false,
        floatingFilter: false,
        minWidth: 220,
        cellRenderer: (params: ICellRendererParams<Organization>) => {
          if (!params.data) return null;
          const org = params.data;
          return (
            <div className="flex items-center gap-2 h-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  router.push(`/superadmin/organizations/${org.id}`)
                }
              >
                <Settings className="h-4 w-4 mr-1" />
                {t("orgs.manageOrg")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggle(org.id, org.is_active)}
              >
                {org.is_active ? (
                  <><Ban className="h-4 w-4 mr-1" />{t("common.deactivate")}</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-1" />{t("common.reactivate")}</>
                )}
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale]
  );

  return (
    <>
      <DataGrid
        rowData={organizations}
        columnDefs={columnDefs}
        exportFileName="organizzazioni"
        onCreate={onCreate}
        onEdit={(org) => openEditDialog(org)}
        onDelete={(selected) => setDeleteOrgs(selected)}
        renderMobileCard={(org) => (
          <div key={org.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{org.name}</span>
              <Badge variant={org.is_active ? "default" : "secondary"}>
                {org.is_active ? t("common.activeF") : t("common.inactiveF")}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {t("orgs.createdAt")} {new Date(org.created_at).toLocaleDateString(locale)}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditDialog(org)}
              >
                {t("common.edit")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/superadmin/organizations/${org.id}`)}
              >
                {t("orgs.manageOrg")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggle(org.id, org.is_active)}
              >
                {org.is_active ? t("common.deactivate") : t("common.reactivate")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOrgs([org])}
              >
                {t("common.delete")}
              </Button>
            </div>
          </div>
        )}
      />

      {/* Edit Organization Dialog */}
      <Dialog
        open={!!editOrg}
        onOpenChange={(open) => !open && setEditOrg(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("orgs.renameTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("common.name")}</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("orgs.currency")}</Label>
              <Select value={editCurrency} onValueChange={(v) => v && setEditCurrency(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrg(null)}>
              <X className="h-4 w-4 mr-1" />
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving || !editName.trim()}>
              <Save className="h-4 w-4 mr-1" />
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Dialog */}
      <Dialog
        open={deleteOrgs.length > 0}
        onOpenChange={(open) => !open && setDeleteOrgs([])}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("orgs.confirmDelete")}</DialogTitle>
            <DialogDescription>
              {deleteOrgs.length === 1 ? (
                <>{t("orgs.confirmDeleteDesc")}{" "}
                <strong>{deleteOrgs[0]?.name}</strong>?{" "}
                {t("orgs.allUsersDeleted")}</>
              ) : (
                <>{t("orgs.confirmDeleteDesc")}{" "}
                <strong>{deleteOrgs.length}</strong> {t("orgs.organizationsQuestion")}
                {" "}{t("orgs.allUsersDeleted")}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOrgs([])}>
              <X className="h-4 w-4 mr-1" />
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {isDeleting ? t("common.deleting") : t("common.delete")}
              {deleteOrgs.length > 1 && ` (${deleteOrgs.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
