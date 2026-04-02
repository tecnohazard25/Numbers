"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Organization } from "@/types/supabase";
import {
  toggleOrganizationAction,
  deleteOrganizationAction,
  renameOrganizationAction,
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
import { toast } from "sonner";
import { Pencil, Settings, Ban, RefreshCw, Trash2, X, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

interface Props {
  organizations: Organization[];
}

export function OrganizationsTable({ organizations }: Props) {
  const router = useRouter();
  const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);
  const [renameOrg, setRenameOrg] = useState<Organization | null>(null);
  const [newName, setNewName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  async function handleToggle(orgId: string, currentActive: boolean) {
    const result = await toggleOrganizationAction(orgId, !currentActive);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(
        currentActive ? "Organizzazione disattivata" : "Organizzazione riattivata"
      );
    }
  }

  async function handleRename() {
    if (!renameOrg) return;
    setIsRenaming(true);
    const result = await renameOrganizationAction(renameOrg.id, newName);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Organizzazione rinominata");
    }
    setIsRenaming(false);
    setRenameOrg(null);
    setNewName("");
  }

  async function handleDelete() {
    if (!deleteOrg) return;
    setIsDeleting(true);
    const result = await deleteOrganizationAction(deleteOrg.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Organizzazione eliminata");
    }
    setIsDeleting(false);
    setDeleteOrg(null);
  }

  const columnDefs = useMemo<ColDef<Organization>[]>(
    () => [
      {
        headerName: "Nome",
        field: "name",
        filter: "agTextColumnFilter",
      },
      {
        headerName: "Stato",
        field: "is_active",
        filter: "agTextColumnFilter",
        cellRenderer: (params: ICellRendererParams<Organization>) => {
          if (params.value == null) return null;
          return params.value ? "Attiva" : "Disattiva";
        },
        valueFormatter: (params) => (params.value ? "Attiva" : "Disattiva"),
      },
      {
        headerName: "Creata il",
        field: "created_at",
        filter: "agDateColumnFilter",
        valueFormatter: (params) =>
          params.value
            ? new Date(params.value).toLocaleDateString("it-IT")
            : "",
      },
      {
        headerName: "Azioni",
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
                variant="outline"
                size="sm"
                onClick={() => {
                  setRenameOrg(org);
                  setNewName(org.name);
                }}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Rinomina
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  router.push(`/superadmin/organizations/${org.id}`)
                }
              >
                <Settings className="h-4 w-4 mr-1" />
                Gestisci
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggle(org.id, org.is_active)}
              >
                {org.is_active ? (
                  <><Ban className="h-4 w-4 mr-1" />Disattiva</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-1" />Riattiva</>
                )}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOrg(org)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Elimina
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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
                {org.is_active ? "Attiva" : "Disattiva"}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              Creata: {new Date(org.created_at).toLocaleDateString("it-IT")}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRenameOrg(org);
                  setNewName(org.name);
                }}
              >
                Rinomina
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/superadmin/organizations/${org.id}`)}
              >
                Gestisci
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggle(org.id, org.is_active)}
              >
                {org.is_active ? "Disattiva" : "Riattiva"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOrg(org)}
              >
                Elimina
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
            <DialogTitle>Conferma eliminazione</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare l&apos;organizzazione{" "}
              <strong>{deleteOrg?.name}</strong>? Tutti gli utenti associati
              verranno eliminati. Questa azione è irreversibile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOrg(null)}>
              <X className="h-4 w-4 mr-1" />
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {isDeleting ? "Eliminazione..." : "Elimina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameOrg}
        onOpenChange={(open) => {
          if (!open) {
            setRenameOrg(null);
            setNewName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rinomina organizzazione</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="newName">Nuovo nome</Label>
            <Input
              id="newName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOrg(null)}>
              <X className="h-4 w-4 mr-1" />
              Annulla
            </Button>
            <Button onClick={handleRename} disabled={isRenaming}>
              <Save className="h-4 w-4 mr-1" />
              {isRenaming ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
