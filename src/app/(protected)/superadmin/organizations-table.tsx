"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Organization } from "@/types/supabase";
import {
  toggleOrganizationAction,
  deleteOrganizationAction,
  renameOrganizationAction,
  updateOrganizationSettingsAction,
} from "@/app/actions/organizations";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Ban, KeyRound, RefreshCw, Save, Trash2, UserCheck, UserPlus, X } from "lucide-react";
import { generatePassword } from "@/lib/password";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/context";
import { CURRENCIES } from "@/lib/locale-defaults";
import { getRoleLabel } from "@/lib/roles";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

// --- Types ---

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
  { name: "user_manager", label: "roles.userManager" },
  { name: "business_analyst", label: "roles.businessAnalyst" },
  { name: "accountant", label: "roles.accountant" },
];

// --- Props ---

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

  // --- Edit org state (full management popup) ---
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [editName, setEditName] = useState("");
  const [editCurrency, setEditCurrency] = useState("EUR");
  const [isSavingOrg, setIsSavingOrg] = useState(false);

  // --- Users within org ---
  const [orgUsers, setOrgUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // --- Create user ---
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Edit user ---
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editPasswordExpiry, setEditPasswordExpiry] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");

  // --- Delete users ---
  const [deleteUsers, setDeleteUsers] = useState<User[]>([]);

  // --- Load users for current org ---
  const loadOrgUsers = useCallback(async (orgId: string) => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/users?orgId=${orgId}`);
      const data = await res.json();
      setOrgUsers(data.users ?? []);
    } catch {
      toast.error(t("common.errorLoading"));
    } finally {
      setLoadingUsers(false);
    }
  }, [t]);

  // --- Open management popup ---
  function openEditDialog(org: Organization) {
    setEditOrg(org);
    setEditName(org.name);
    setEditCurrency(org.currency ?? "EUR");
    loadOrgUsers(org.id);
  }

  // --- Save org settings ---
  async function handleSaveOrgSettings() {
    if (!editOrg || !editName.trim()) return;
    setIsSavingOrg(true);

    if (editName.trim() !== editOrg.name) {
      const r = await renameOrganizationAction(editOrg.id, editName.trim());
      if (r.error) { toast.error(r.error); setIsSavingOrg(false); return; }
    }
    if (editCurrency !== (editOrg.currency ?? "EUR")) {
      const r = await updateOrganizationSettingsAction(editOrg.id, { currency: editCurrency });
      if (r.error) { toast.error(r.error); setIsSavingOrg(false); return; }
    }

    toast.success(t("orgs.settingsSaved"));
    // Update local state so header reflects changes
    setEditOrg({ ...editOrg, name: editName.trim(), currency: editCurrency });
    onRefresh();
    setIsSavingOrg(false);
  }

  // --- User CRUD ---
  function openUserEditDialog(user: User) {
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

  async function handleSaveUserEdit() {
    if (!editUser || !editOrg) return;
    setIsSubmitting(true);
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
      loadOrgUsers(editOrg.id);
    }
    setIsSubmitting(false);
  }

  async function handleCreateUser(formData: FormData) {
    if (!editOrg) return;
    setIsSubmitting(true);
    formData.set("organizationId", editOrg.id);
    const result = await createUserAction(formData);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("users.created"));
      setCreateUserOpen(false);
      loadOrgUsers(editOrg.id);
    }
    setIsSubmitting(false);
  }

  async function handleToggleUser(userId: string, currentActive: boolean) {
    if (!editOrg) return;
    const result = await toggleUserAction(userId, !currentActive);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(currentActive ? t("users.deactivated") : t("users.reactivated"));
      loadOrgUsers(editOrg.id);
    }
  }

  async function handleDeleteUsers() {
    if (deleteUsers.length === 0 || !editOrg) return;
    setIsSubmitting(true);
    let hasError = false;
    for (const user of deleteUsers) {
      const result = await deleteUserAction(user.id);
      if (result.error) {
        toast.error(`${user.first_name} ${user.last_name}: ${result.error}`);
        hasError = true;
      }
    }
    if (!hasError) toast.success(t("users.deleted"));
    loadOrgUsers(editOrg.id);
    setIsSubmitting(false);
    setDeleteUsers([]);
  }

  async function handleImpersonate(userId: string) {
    const res = await fetch("/api/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.error) { toast.error(data.error); return; }
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: data.tokenHash,
      type: "magiclink",
    });
    if (otpError) {
      toast.error(t("subjects.impersonationError") + otpError.message);
      return;
    }
    window.location.href = "/dashboard";
  }

  // --- Org toggle / delete ---
  async function handleToggleOrg(orgId: string, currentActive: boolean) {
    const result = await toggleOrganizationAction(orgId, !currentActive);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(currentActive ? t("orgs.deactivated") : t("orgs.reactivated"));
      onRefresh();
    }
  }

  async function handleDeleteOrgs() {
    if (deleteOrgs.length === 0) return;
    setIsDeleting(true);
    let hasError = false;
    for (const org of deleteOrgs) {
      const result = await deleteOrganizationAction(org.id);
      if (result.error) { toast.error(`${org.name}: ${result.error}`); hasError = true; }
    }
    if (!hasError) toast.success(t("orgs.deleted"));
    onRefresh();
    setIsDeleting(false);
    setDeleteOrgs([]);
  }

  // --- Org grid columns ---
  const orgColumnDefs = useMemo<ColDef<Organization>[]>(
    () => [
      { headerName: t("common.name"), field: "name", filter: "agTextColumnFilter" },
      { headerName: t("orgs.currency"), field: "currency", filter: "agTextColumnFilter", maxWidth: 120 },
      {
        headerName: t("common.status"), field: "is_active", filter: "agTextColumnFilter",
        cellRenderer: (params: ICellRendererParams<Organization>) => params.value == null ? null : (params.value ? t("common.activeF") : t("common.inactiveF")),
        valueFormatter: (params) => (params.value ? t("common.activeF") : t("common.inactiveF")),
      },
      {
        headerName: t("orgs.createdOn"), field: "created_at", filter: "agDateColumnFilter",
        valueFormatter: (params) => params.value ? new Date(params.value).toLocaleDateString(locale) : "",
      },
      {
        headerName: t("common.actions"), sortable: false, filter: false, resizable: false, floatingFilter: false, minWidth: 150,
        cellRenderer: (params: ICellRendererParams<Organization>) => {
          if (!params.data) return null;
          const org = params.data;
          return (
            <div className="flex items-center gap-2 h-full">
              <Button variant="outline" size="sm" onClick={() => handleToggleOrg(org.id, org.is_active)}>
                {org.is_active ? (<><Ban className="h-4 w-4 mr-1" />{t("common.deactivate")}</>) : (<><RefreshCw className="h-4 w-4 mr-1" />{t("common.reactivate")}</>)}
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale]
  );

  // --- User grid columns (inside popup) ---
  const userColumnDefs = useMemo<ColDef<User>[]>(
    () => [
      {
        headerName: t("common.name"),
        valueGetter: (params) => params.data ? `${params.data.first_name} ${params.data.last_name}` : "",
        filter: "agTextColumnFilter",
      },
      { headerName: t("common.email"), field: "email", filter: "agTextColumnFilter", hide: true },
      {
        headerName: t("common.roles"),
        valueGetter: (params) => params.data?.user_roles?.map((ur) => t(getRoleLabel(ur.roles.name))).join(", ") ?? "",
        filter: "agTextColumnFilter",
      },
      {
        headerName: t("common.status"), field: "is_active", filter: "agTextColumnFilter",
        valueFormatter: (params) => (params.value ? t("common.active") : t("common.inactive")),
      },
      {
        headerName: t("common.actions"), sortable: false, filter: false, resizable: false, floatingFilter: false, minWidth: 100,
        cellRenderer: (params: ICellRendererParams<User>) => {
          if (!params.data) return null;
          const user = params.data;
          return (
            <div className="flex items-center gap-1 h-full">
              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="secondary" size="icon-sm" onClick={() => handleImpersonate(user.id)}>
                    <UserCheck className="h-4 w-4" />
                  </Button>
                } />
                <TooltipContent>{t("users.impersonate")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="outline" size="icon-sm" onClick={() => handleToggleUser(user.id, user.is_active)}>
                    {user.is_active ? <Ban className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                } />
                <TooltipContent>{user.is_active ? t("common.deactivate") : t("common.reactivate")}</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  return (
    <>
      <DataGrid
        rowData={organizations}
        columnDefs={orgColumnDefs}
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
              <Button variant="outline" size="sm" onClick={() => openEditDialog(org)}>{t("common.edit")}</Button>
              <Button variant="outline" size="sm" onClick={() => handleToggleOrg(org.id, org.is_active)}>
                {org.is_active ? t("common.deactivate") : t("common.reactivate")}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteOrgs([org])}>{t("common.delete")}</Button>
            </div>
          </div>
        )}
      />

      {/* ============================================================= */}
      {/* FULL MANAGEMENT POPUP                                          */}
      {/* ============================================================= */}
      <Dialog
        open={!!editOrg}
        onOpenChange={(open) => {
          if (!open) {
            setEditOrg(null);
            setEditUser(null);
            setCreateUserOpen(false);
            setDeleteUsers([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editOrg?.name} — {t("orgs.managementTitle")}</DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {/* --- Org settings --- */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("orgs.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("common.name")}</Label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("orgs.currency")}</Label>
                  <Select value={editCurrency} onValueChange={(v) => v && setEditCurrency(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSaveOrgSettings} disabled={isSavingOrg || !editName.trim()}>
                  <Save className="h-4 w-4 mr-1" />
                  {isSavingOrg ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* --- Users section --- */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("users.title")}</CardTitle>
              <CardDescription>{orgUsers.length} {t("users.usersInThisOrg")}</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingUsers ? (
                <p className="text-muted-foreground text-center py-4">{t("common.loading")}</p>
              ) : (
                <DataGrid
                  rowData={orgUsers}
                  columnDefs={userColumnDefs}
                  exportFileName={`utenti-${editOrg?.slug ?? "org"}`}
                  height="280px"
                  onCreate={() => setCreateUserOpen(true)}
                  onEdit={(user) => openUserEditDialog(user)}
                  onDelete={(selected) => setDeleteUsers(selected)}
                  renderMobileCard={(user) => (
                    <div key={user.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{user.first_name} {user.last_name}</span>
                        <Badge variant={user.is_active ? "default" : "secondary"} className="text-xs">
                          {user.is_active ? t("common.active") : t("common.inactive")}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                      <div className="flex gap-1 flex-wrap">
                        {user.user_roles.map((ur) => (
                          <Badge key={ur.roles.name} variant="outline" className="text-xs">{t(getRoleLabel(ur.roles.name))}</Badge>
                        ))}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => openUserEditDialog(user)}>{t("common.edit")}</Button>
                        <Button variant="secondary" size="sm" onClick={() => handleImpersonate(user.id)}>
                          <UserCheck className="h-3.5 w-3.5 mr-1" />{t("users.impersonate")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleToggleUser(user.id, user.is_active)}>
                          {user.is_active ? t("common.deactivate") : t("common.reactivate")}
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleteUsers([user])}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                />
              )}
            </CardContent>
          </Card>

          {/* --- Tools section --- */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("orgs.tools")}</CardTitle>
              <CardDescription>{t("orgs.toolsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => {
                if (editOrg) router.push(`/superadmin/organizations/${editOrg.id}/generate`);
              }}>
                {t("orgs.generateData")}
              </Button>
            </CardContent>
          </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============================================================= */}
      {/* CREATE USER DIALOG (nested)                                    */}
      {/* ============================================================= */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.createNewUser")}</DialogTitle>
            <DialogDescription>{t("users.userWillReceiveInvite")}</DialogDescription>
          </DialogHeader>
          <form action={handleCreateUser} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cu-firstName">{t("subjects.firstName")}</Label>
                <Input id="cu-firstName" name="firstName" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cu-lastName">{t("subjects.lastName")}</Label>
                <Input id="cu-lastName" name="lastName" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cu-email">{t("common.email")}</Label>
              <Input id="cu-email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cu-password">{t("users.initialPassword")}</Label>
              <div className="flex gap-2">
                <Input id="cu-password" name="password" type="text" required autoComplete="off" />
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => {
                  const el = document.getElementById("cu-password") as HTMLInputElement;
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
                {AVAILABLE_ROLES.map((role) => (
                  <label key={role.name} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="roles" value={role.name} className="rounded" />
                    {t(role.label)}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                <UserPlus className="h-4 w-4 mr-1" />
                {isSubmitting ? t("common.creating") : t("users.createUser")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreateUserOpen(false)}>
                <X className="h-4 w-4 mr-1" />{t("common.cancel")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============================================================= */}
      {/* EDIT USER DIALOG (nested)                                      */}
      {/* ============================================================= */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) { setEditUser(null); setEditNewPassword(""); } }}>
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
                        if (e.target.checked) setEditRoles([...editRoles, role.name]);
                        else setEditRoles(editRoles.filter((r) => r !== role.name));
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
              <Input type="date" value={editPasswordExpiry} onChange={(e) => setEditPasswordExpiry(e.target.value)} />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>{t("users.setNewPassword")}</Label>
              <Input type="password" value={editNewPassword} onChange={(e) => setEditNewPassword(e.target.value)} placeholder={t("users.leaveEmptyToKeep")} />
              <p className="text-xs text-muted-foreground">{t("users.passwordExpiryNote")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveUserEdit} disabled={isSubmitting}>
              <Save className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              <X className="h-4 w-4 mr-1" />{t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================= */}
      {/* DELETE USERS DIALOG                                            */}
      {/* ============================================================= */}
      <Dialog open={deleteUsers.length > 0} onOpenChange={(open) => !open && setDeleteUsers([])}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.confirmDelete")}</DialogTitle>
            <DialogDescription>
              {deleteUsers.length === 1
                ? <>{t("users.confirmDeleteDesc")} <strong>{deleteUsers[0]?.first_name} {deleteUsers[0]?.last_name}</strong>? {t("users.irreversible")}</>
                : <>{t("users.confirmDeleteDesc")} <strong>{deleteUsers.length}</strong> {t("users.usersQuestion")} {t("users.irreversible")}</>
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={handleDeleteUsers} disabled={isSubmitting}>
              <Trash2 className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.deleting") : t("common.delete")}
              {deleteUsers.length > 1 && ` (${deleteUsers.length})`}
            </Button>
            <Button variant="outline" onClick={() => setDeleteUsers([])}><X className="h-4 w-4 mr-1" />{t("common.cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================= */}
      {/* DELETE ORGS DIALOG                                             */}
      {/* ============================================================= */}
      <Dialog open={deleteOrgs.length > 0} onOpenChange={(open) => !open && setDeleteOrgs([])}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("orgs.confirmDelete")}</DialogTitle>
            <DialogDescription>
              {deleteOrgs.length === 1
                ? <>{t("orgs.confirmDeleteDesc")} <strong>{deleteOrgs[0]?.name}</strong>? {t("orgs.allUsersDeleted")}</>
                : <>{t("orgs.confirmDeleteDesc")} <strong>{deleteOrgs.length}</strong> {t("orgs.organizationsQuestion")} {t("orgs.allUsersDeleted")}</>
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={handleDeleteOrgs} disabled={isDeleting}>
              <Trash2 className="h-4 w-4 mr-1" />
              {isDeleting ? t("common.deleting") : t("common.delete")}
              {deleteOrgs.length > 1 && ` (${deleteOrgs.length})`}
            </Button>
            <Button variant="outline" onClick={() => setDeleteOrgs([])}><X className="h-4 w-4 mr-1" />{t("common.cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
