"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n/context";
import {
  toggleUserAction,
  createUserAction,
  deleteUserAction,
  updateUserAction,
} from "@/app/actions/users";
import { DataGrid } from "@/components/data-grid";
import { Badge } from "@/components/ui/badge";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Ban, KeyRound, Plus, RefreshCw, Save, Trash2, Users, UserPlus, X } from "lucide-react";
import { generatePassword } from "@/lib/password";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { ROLE_LABELS } from "@/lib/roles";

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  password_expires_at?: string;
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
  onRefresh: () => void;
}

const ALL_ROLES = Object.entries(ROLE_LABELS).map(([name, label]) => ({ name, label }));

export function UsersPageClient({ users, organizations, isSuperadmin, onRefresh }: Props) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Edit state
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editPasswordExpiry, setEditPasswordExpiry] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");

  // Delete state
  const [deleteUsers, setDeleteUsers] = useState<User[]>([]);

  const availableRoles = isSuperadmin
    ? ALL_ROLES
    : ALL_ROLES.filter((r) => r.name !== "superadmin");

  function openEditDialog(user: User) {
    setEditUser(user);
    setEditFirstName(user.first_name);
    setEditLastName(user.last_name);
    setEditRoles(user.user_roles.map((ur) => ur.roles.name));
    setEditPasswordExpiry(
      user.password_expires_at
        ? new Date(user.password_expires_at).toISOString().slice(0, 10)
        : ""
    );
    setEditNewPassword("");
  }

  async function handleSaveEdit() {
    if (!editUser) return;
    setIsLoading(true);
    const result = await updateUserAction(editUser.id, {
      firstName: editFirstName,
      lastName: editLastName,
      roles: editRoles,
      passwordExpiresAt: editPasswordExpiry
        ? new Date(editPasswordExpiry).toISOString()
        : new Date().toISOString(),
      newPassword: editNewPassword || undefined,
    });
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("users.updated"));
      setEditUser(null);
      onRefresh();
    }
    setIsLoading(false);
  }

  async function handleToggle(userId: string, currentActive: boolean) {
    const result = await toggleUserAction(userId, !currentActive);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(
        currentActive ? t("users.deactivated") : t("users.reactivated")
      );
      onRefresh();
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
      onRefresh();
    }
    setIsLoading(false);
  }

  async function handleDelete() {
    if (deleteUsers.length === 0) return;
    setIsLoading(true);
    let hasError = false;
    for (const user of deleteUsers) {
      const result = await deleteUserAction(user.id);
      if (result.error) {
        toast.error(`${user.first_name} ${user.last_name}: ${result.error}`);
        hasError = true;
      }
    }
    if (!hasError) {
      toast.success(t("users.deleted"));
    }
    onRefresh();
    setIsLoading(false);
    setDeleteUsers([]);
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        minWidth: 150,
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
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          {t("users.title")}
        </h1>
      </div>

      <DataGrid
        rowData={users}
        columnDefs={columnDefs}
        exportFileName="utenti"
        onCreate={() => setDialogOpen(true)}
        onEdit={(user) => openEditDialog(user)}
        onDelete={(selected) => setDeleteUsers(selected)}
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
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditDialog(user)}
              >
                {t("common.edit")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggle(user.id, user.is_active)}
              >
                {user.is_active ? t("common.deactivate") : t("common.reactivate")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteUsers([user])}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      />

      {/* Create User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
              <Label htmlFor="sa-password">{t("users.initialPassword")}</Label>
              <div className="flex gap-2">
                <Input id="sa-password" name="password" type="text" required autoComplete="off" />
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => {
                  const el = document.getElementById("sa-password") as HTMLInputElement;
                  if (el) { el.value = generatePassword(); }
                }}>
                  <KeyRound className="h-4 w-4 mr-1" />
                  {t("users.generatePassword")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("auth.passwordRequirements")}</p>
              <p className="text-xs text-muted-foreground">{t("users.passwordExpiresOnLogin")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("common.roles")}</Label>
              <div className="space-y-2">
                {availableRoles.map((role) => (
                  <label key={role.name} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="roles" value={role.name} className="rounded" />
                    {t(role.label)}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isLoading}>
                <UserPlus className="h-4 w-4 mr-1" />
                {isLoading ? t("common.creating") : t("users.createUser")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                <X className="h-4 w-4 mr-1" />
                {t("common.cancel")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog
        open={!!editUser}
        onOpenChange={(open) => {
          if (!open) {
            setEditUser(null);
            setEditNewPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.editUser")}</DialogTitle>
            <DialogDescription>{editUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("subjects.firstName")}</Label>
                <Input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("subjects.lastName")}</Label>
                <Input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("common.roles")}</Label>
              <div className="space-y-2">
                {availableRoles.map((role) => (
                  <label key={role.name} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editRoles.includes(role.name)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditRoles([...editRoles, role.name]);
                        } else {
                          setEditRoles(editRoles.filter((r) => r !== role.name));
                        }
                      }}
                      className="rounded"
                    />
                    {t(role.label)}
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>{t("users.passwordExpiry")}</Label>
              <Input
                type="date"
                value={editPasswordExpiry}
                onChange={(e) => setEditPasswordExpiry(e.target.value)}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>{t("users.setNewPassword")}</Label>
              <Input
                type="password"
                value={editNewPassword}
                onChange={(e) => setEditNewPassword(e.target.value)}
                placeholder={t("users.leaveEmptyToKeep")}
              />
              <p className="text-xs text-muted-foreground">
                {t("users.passwordExpiryNote")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveEdit} disabled={isLoading}>
              <Save className="h-4 w-4 mr-1" />
              {isLoading ? t("common.saving") : t("common.save")}
            </Button>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              <X className="h-4 w-4 mr-1" />
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteUsers.length > 0} onOpenChange={(open) => !open && setDeleteUsers([])}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.confirmDelete")}</DialogTitle>
            <DialogDescription>
              {deleteUsers.length === 1 ? (
                <>{t("users.confirmDeleteDesc")}{" "}
                <strong>{deleteUsers[0]?.first_name} {deleteUsers[0]?.last_name}</strong>?
                {" "}{t("users.irreversible")}</>
              ) : (
                <>{t("users.confirmDeleteDesc")}{" "}
                <strong>{deleteUsers.length}</strong> {t("users.usersQuestion")}
                {" "}{t("users.irreversible")}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
              <Trash2 className="h-4 w-4 mr-1" />
              {isLoading ? t("common.deleting") : t("common.delete")}
              {deleteUsers.length > 1 && ` (${deleteUsers.length})`}
            </Button>
            <Button variant="outline" onClick={() => setDeleteUsers([])}>
              <X className="h-4 w-4 mr-1" />
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
