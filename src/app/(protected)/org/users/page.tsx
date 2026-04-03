"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserAction,
  toggleUserAction,
  deleteUserAction,
  updateUserAction,
} from "@/app/actions/users";
import { DataGrid } from "@/components/data-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Ban, Pencil, Plus, RefreshCw, Save, Trash2, UserPlus, X } from "lucide-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { ROLE_LABELS } from "@/lib/roles";
import { useTranslation } from "@/lib/i18n/context";

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  password_expires_at: string;
  user_roles: { roles: { name: string; id: string } }[];
}

const AVAILABLE_ROLES = [
  { name: "business_analyst", label: "roles.businessAnalyst" },
  { name: "accountant", label: "roles.accountant" },
];

export default function OrgUsersPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteUsers, setDeleteUsers] = useState<User[]>([]);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editPasswordExpiry, setEditPasswordExpiry] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadData(oid?: string) {
    const id = oid ?? orgId;
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const usersRes = await fetch(`/api/users?orgId=${id}`);
      const data = await usersRes.json();
      setUsers(data.users ?? []);
    } catch (err) {
      console.error("Error loading users:", err);
      toast.error(t("common.errorLoading"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const infoRes = await fetch("/api/user-info");
        const info = await infoRes.json();
        const roles: string[] = info.roles ?? [];
        if (!roles.includes("user_manager")) {
          router.push("/dashboard");
          return;
        }
        const oid = info.profile?.organization_id;
        if (oid) {
          setOrgId(oid);
          await loadData(oid);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Error initializing:", err);
        setLoading(false);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setIsSubmitting(true);
    const result = await updateUserAction(editUser.id, {
      firstName: editFirstName,
      lastName: editLastName,
      roles: editRoles,
      passwordExpiresAt: new Date(editPasswordExpiry).toISOString(),
      newPassword: editNewPassword || undefined,
    });
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("users.updated"));
      setEditUser(null);
      loadData();
    }
    setIsSubmitting(false);
  }

  async function handleCreateUser(formData: FormData) {
    setIsSubmitting(true);
    const result = await createUserAction(formData);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("users.created"));
      setCreateDialogOpen(false);
      loadData();
    }
    setIsSubmitting(false);
  }

  async function handleToggle(userId: string, currentActive: boolean) {
    const result = await toggleUserAction(userId, !currentActive);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(currentActive ? t("users.deactivated") : t("users.reactivated"));
      loadData();
    }
  }

  async function handleDelete() {
    if (deleteUsers.length === 0) return;
    setIsSubmitting(true);
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
    loadData();
    setIsSubmitting(false);
    setDeleteUsers([]);
  }

  const columnDefs = useMemo<ColDef<User>[]>(
    () => [
      {
        headerName: t("common.name"),
        valueGetter: (params) =>
          params.data ? `${params.data.first_name} ${params.data.last_name}` : "",
        filter: "agTextColumnFilter",
      },
      {
        headerName: t("common.email"),
        field: "email",
        filter: "agTextColumnFilter",
      },
      {
        headerName: t("common.roles"),
        valueGetter: (params) =>
          params.data?.user_roles?.map((ur) => t(ROLE_LABELS[ur.roles.name] ?? ur.roles.name)).join(", ") ?? "",
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
    [t]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("users.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {users.length} {t("users.usersInOrg")}
          </p>
        </div>
      </div>

      {/* Data Grid */}
      <DataGrid
        rowData={users}
        columnDefs={columnDefs}
        exportFileName="utenti"
        onCreate={() => setCreateDialogOpen(true)}
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
            <div className="flex gap-1 flex-wrap">
              {user.user_roles.map((ur) => (
                <Badge key={ur.roles.name} variant="outline">
                  {t(ROLE_LABELS[ur.roles.name] ?? ur.roles.name)}
                </Badge>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => openEditDialog(user)}>
                <Pencil className="h-4 w-4 mr-1" /> {t("common.edit")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleToggle(user.id, user.is_active)}>
                {user.is_active ? t("common.deactivate") : t("common.reactivate")}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteUsers([user])}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      />

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.createNewUser")}</DialogTitle>
            <DialogDescription>
              {t("users.userWillReceiveInvite")}
            </DialogDescription>
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
            <div className="space-y-2">
              <Label>{t("common.roles")}</Label>
              <div className="space-y-2">
                {AVAILABLE_ROLES.map((role) => (
                  <label key={role.name} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="roles" value={role.name} className="rounded" />
                    {t(role.label)}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                <X className="h-4 w-4 mr-1" />
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                <UserPlus className="h-4 w-4 mr-1" />
                {isSubmitting ? t("common.creating") : t("users.createUser")}
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
                {AVAILABLE_ROLES.map((role) => (
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
            <Button variant="outline" onClick={() => setEditUser(null)}>
              <X className="h-4 w-4 mr-1" />
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSubmitting}>
              <Save className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.saving") : t("common.save")}
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
            <Button variant="outline" onClick={() => setDeleteUsers([])}>
              <X className="h-4 w-4 mr-1" />
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
              <Trash2 className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.deleting") : t("common.delete")}
              {deleteUsers.length > 1 && ` (${deleteUsers.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
