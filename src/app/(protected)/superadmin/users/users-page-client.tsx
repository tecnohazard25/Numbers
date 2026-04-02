"use client";

import { useMemo, useState } from "react";
import { toggleUserAction, createUserAction } from "@/app/actions/users";
import { DataGrid } from "@/components/data-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Ban, Plus, RefreshCw, Users, UserPlus, X } from "lucide-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  organization_id: string | null;
  organizations: { name: string } | null;
  user_roles: { roles: { name: string } }[];
}

interface Organization {
  id: string;
  name: string;
}

interface Props {
  users: User[];
  organizations: Organization[];
  isSuperadmin: boolean;
}

const ALL_ROLES = [
  { name: "superadmin", label: "Super Admin" },
  { name: "org_admin", label: "Admin Organizzazione" },
  { name: "business_analyst", label: "Business Analyst" },
  { name: "accountant", label: "Contabile" },
];

export function UsersPageClient({ users, organizations, isSuperadmin }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const availableRoles = isSuperadmin
    ? ALL_ROLES
    : ALL_ROLES.filter(
        (r) => r.name !== "superadmin" && r.name !== "org_admin"
      );

  async function handleToggle(userId: string, currentActive: boolean) {
    const result = await toggleUserAction(userId, !currentActive);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(
        currentActive ? "Utente disattivato" : "Utente riattivato"
      );
    }
  }

  async function handleCreateUser(formData: FormData) {
    setIsLoading(true);
    const result = await createUserAction(formData);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Utente creato con successo");
      setDialogOpen(false);
    }
    setIsLoading(false);
  }

  const columnDefs = useMemo<ColDef<User>[]>(
    () => [
      {
        headerName: "Nome",
        valueGetter: (params) =>
          params.data
            ? `${params.data.first_name} ${params.data.last_name}`
            : "",
        filter: "agTextColumnFilter",
      },
      {
        headerName: "Email",
        field: "email",
        filter: "agTextColumnFilter",
      },
      ...(isSuperadmin
        ? [
            {
              headerName: "Organizzazione",
              valueGetter: (params: any) =>
                params.data?.organizations?.name ?? "—",
              filter: "agTextColumnFilter",
              enableRowGroup: true,
            } as ColDef<User>,
          ]
        : []),
      {
        headerName: "Ruoli",
        valueGetter: (params) =>
          params.data?.user_roles
            ?.map((ur: { roles: { name: string } }) => ur.roles.name)
            .join(", ") ?? "",
        filter: "agTextColumnFilter",
      },
      {
        headerName: "Stato",
        field: "is_active",
        filter: "agTextColumnFilter",
        valueFormatter: (params) => (params.value ? "Attivo" : "Disattivo"),
      },
      {
        headerName: "Azioni",
        sortable: false,
        filter: false,
        resizable: false,
        floatingFilter: false,
        minWidth: 120,
        cellRenderer: (params: ICellRendererParams<User>) => {
          if (!params.data) return null;
          const user = params.data;
          return (
            <div className="flex items-center gap-2 h-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggle(user.id, user.is_active)}
              >
                {user.is_active ? (
                  <><Ban className="h-4 w-4 mr-1" />Disattiva</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-1" />Riattiva</>
                )}
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSuperadmin]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Utenti
        </h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Utente
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crea Nuovo Utente</DialogTitle>
            </DialogHeader>
            <form action={handleCreateUser} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Nome</Label>
                  <Input id="firstName" name="firstName" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Cognome</Label>
                  <Input id="lastName" name="lastName" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              {isSuperadmin && (
                <div className="space-y-2">
                  <Label htmlFor="organizationId">Organizzazione</Label>
                  <Select name="organizationId">
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona organizzazione" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Ruoli</Label>
                <div className="space-y-2">
                  {availableRoles.map((role) => (
                    <label
                      key={role.name}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="roles"
                        value={role.name}
                        className="rounded"
                      />
                      {role.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  <X className="h-4 w-4 mr-1" />
                  Annulla
                </Button>
                <Button type="submit" disabled={isLoading}>
                  <UserPlus className="h-4 w-4 mr-1" />
                  {isLoading ? "Creazione..." : "Crea Utente"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataGrid
        rowData={users}
        columnDefs={columnDefs}
        exportFileName="utenti"
        renderMobileCard={(user) => (
          <div key={user.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {user.first_name} {user.last_name}
              </span>
              <Badge variant={user.is_active ? "default" : "secondary"}>
                {user.is_active ? "Attivo" : "Disattivo"}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
            {user.organizations?.name && (
              <div className="text-sm text-muted-foreground">
                Org: {user.organizations.name}
              </div>
            )}
            <div className="flex gap-1 flex-wrap">
              {user.user_roles.map((ur) => (
                <Badge key={ur.roles.name} variant="outline">
                  {ur.roles.name}
                </Badge>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => handleToggle(user.id, user.is_active)}
            >
              {user.is_active ? "Disattiva" : "Riattiva"}
            </Button>
          </div>
        )}
      />
    </div>
  );
}
