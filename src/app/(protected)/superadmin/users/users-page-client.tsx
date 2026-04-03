"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n/context";
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

import { ROLE_LABELS } from "@/lib/roles";

const ALL_ROLES = Object.entries(ROLE_LABELS).map(([name, label]) => ({ name, label }));

export function UsersPageClient({ users, organizations, isSuperadmin }: Props) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const availableRoles = isSuperadmin
    ? ALL_ROLES
    : ALL_ROLES.filter(
        (r) => r.name !== "superadmin" && r.name !== "user_manager"
      );

  async function handleToggle(userId: string, currentActive: boolean) {
    const result = await toggleUserAction(userId, !currentActive);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(
        currentActive ? t("users.deactivated") : t("users.reactivated")
      );
    }
  }

  async function handleCreateUser(formData: FormData) {
    setIsLoading(true);
    const result = await createUserAction(formData);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("users.created"));
      setDialogOpen(false);
    }
    setIsLoading(false);
  }

  const columnDefs = useMemo<ColDef<User>[]>(
    () => [
      {
        headerName: t("common.name"),
        valueGetter: (params) =>
          params.data
            ? `${params.data.first_name} ${params.data.last_name}`
            : "",
        filter: "agTextColumnFilter",
      },
      {
        headerName: t("common.email"),
        field: "email",
        filter: "agTextColumnFilter",
      },
      ...(isSuperadmin
        ? [
            {
              headerName: t("users.organization"),
              valueGetter: (params: any) =>
                params.data?.organizations?.name ?? "—",
              filter: "agTextColumnFilter",
            } as ColDef<User>,
          ]
        : []),
      {
        headerName: t("common.roles"),
        valueGetter: (params) =>
          params.data?.user_roles
            ?.map((ur: { roles: { name: string } }) => t(ROLE_LABELS[ur.roles.name] ?? ur.roles.name))
            .join(", ") ?? "",
        filter: "agTextColumnFilter",
      },
      {
        headerName: t("common.status"),
        field: "is_active",
        filter: "agTextColumnFilter",
        valueFormatter: (params) => (params.value ? t("common.active") : t("common.inactive")),
      },
      {
        headerName: t("common.actions"),
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
    [isSuperadmin, t]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          {t("users.title")}
        </h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="h-4 w-4 mr-2" />
            {t("users.newUser")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("users.createNewUser")}</DialogTitle>
            </DialogHeader>
            <form action={handleCreateUser} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("subjects.firstName")}</Label>
                  <Input id="firstName" name="firstName" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("subjects.lastName")}</Label>
                  <Input id="lastName" name="lastName" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("common.email")}</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              {isSuperadmin && (
                <div className="space-y-2">
                  <Label htmlFor="organizationId">{t("users.organization")}</Label>
                  <Select name="organizationId">
                    <SelectTrigger>
                      <SelectValue placeholder={t("users.selectOrganization")} />
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
                <Label>{t("common.roles")}</Label>
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
                      {t(role.label)}
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
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={isLoading}>
                  <UserPlus className="h-4 w-4 mr-1" />
                  {isLoading ? t("common.creating") : t("users.createUser")}
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
                {user.is_active ? t("common.active") : t("common.inactive")}
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
                  {t(ROLE_LABELS[ur.roles.name] ?? ur.roles.name)}
                </Badge>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => handleToggle(user.id, user.is_active)}
            >
              {user.is_active ? t("common.deactivate") : t("common.reactivate")}
            </Button>
          </div>
        )}
      />
    </div>
  );
}
