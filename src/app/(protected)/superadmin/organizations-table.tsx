"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Organization } from "@/types/supabase";
import {
  toggleOrganizationAction,
  deleteOrganizationAction,
} from "@/app/actions/organizations";
import { DataGrid } from "@/components/data-grid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Settings, Ban, RefreshCw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/context";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

interface Props {
  organizations: Organization[];
}

export function OrganizationsTable({ organizations }: Props) {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleToggle(orgId: string, currentActive: boolean) {
    const result = await toggleOrganizationAction(orgId, !currentActive);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(
        currentActive ? t("orgs.deactivated") : t("orgs.reactivated")
      );
      router.refresh();
    }
  }

  async function handleDelete() {
    if (!deleteOrg) return;
    setIsDeleting(true);
    const result = await deleteOrganizationAction(deleteOrg.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("orgs.deleted"));
      router.refresh();
    }
    setIsDeleting(false);
    setDeleteOrg(null);
  }

  const columnDefs = useMemo<ColDef<Organization>[]>(
    () => [
      {
        headerName: t("common.name"),
        field: "name",
        filter: "agTextColumnFilter",
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
        minWidth: 360,
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
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOrg(org)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t("common.delete")}
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
                onClick={() => setDeleteOrg(org)}
              >
                {t("common.delete")}
              </Button>
            </div>
          </div>
        )}
      />

      <Dialog
        open={!!deleteOrg}
        onOpenChange={(open) => !open && setDeleteOrg(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("orgs.confirmDelete")}</DialogTitle>
            <DialogDescription>
              {t("orgs.confirmDeleteDesc")}{" "}
              <strong>{deleteOrg?.name}</strong>?{" "}
              {t("orgs.allUsersDeleted")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOrg(null)}>
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
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
