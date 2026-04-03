"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Organization } from "@/types/supabase";
import {
  createUserAction,
  toggleUserAction,
  deleteUserAction,
  updateUserAction,
} from "@/app/actions/users";
import {
  updateOrganizationSettingsAction,
  renameOrganizationAction,
} from "@/app/actions/organizations";
import { DataGrid } from "@/components/data-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  SUPPORTED_LOCALES,
  CURRENCIES,
  DATE_FORMATS,
  TIME_FORMATS,
  DECIMAL_SEPARATORS,
  THOUSANDS_SEPARATORS,
  getLocaleDefaults,
} from "@/lib/locale-defaults";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, Ban, Pencil, Plus, RefreshCw, Save, Trash2, UserCheck, UserPlus, X } from "lucide-react";
import { ROLE_LABELS, getRoleLabel } from "@/lib/roles";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

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
  { name: "user_manager", label: "Gestione Utenti" },
  { name: "business_analyst", label: "Business Analyst" },
  { name: "accountant", label: "Contabile" },
];

export default function OrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;

  const [org, setOrg] = useState<Organization | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editPasswordExpiry, setEditPasswordExpiry] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Settings state
  const [locale, setLocale] = useState("it-IT");
  const [currency, setCurrency] = useState("EUR");
  const [dateFormat, setDateFormat] = useState("dd/MM/yyyy");
  const [timeFormat, setTimeFormat] = useState("HH:mm");
  const [decimalSep, setDecimalSep] = useState(",");
  const [thousandsSep, setThousandsSep] = useState(".");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Rename state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  async function loadData() {
    const [orgRes, usersRes] = await Promise.all([
      fetch(`/api/organizations/${orgId}`),
      fetch(`/api/users?orgId=${orgId}`),
    ]);
    const orgData = await orgRes.json();
    const usersData = await usersRes.json();
    const o = orgData.organization;
    setOrg(o);
    if (o) {
      setLocale(o.locale ?? "it-IT");
      setCurrency(o.currency ?? "EUR");
      setDateFormat(o.date_format ?? "dd/MM/yyyy");
      setTimeFormat(o.time_format ?? "HH:mm");
      setDecimalSep(o.decimal_separator ?? ",");
      setThousandsSep(o.thousands_separator ?? ".");
    }
    setUsers(usersData.users ?? []);
    setLoading(false);
  }

  function handleLocaleChange(newLocale: string) {
    setLocale(newLocale);
    const defaults = getLocaleDefaults(newLocale);
    setCurrency(defaults.currency);
    setDateFormat(defaults.date_format);
    setTimeFormat(defaults.time_format);
    setDecimalSep(defaults.decimal_separator);
    setThousandsSep(defaults.thousands_separator);
  }

  async function handleRename() {
    if (!newName.trim()) return;
    setIsRenaming(true);
    const result = await renameOrganizationAction(orgId, newName);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Organizzazione rinominata");
      setRenameDialogOpen(false);
      loadData();
    }
    setIsRenaming(false);
  }

  async function handleSaveSettings() {
    setIsSavingSettings(true);
    const result = await updateOrganizationSettingsAction(orgId, {
      locale,
      currency,
      date_format: dateFormat,
      time_format: timeFormat,
      decimal_separator: decimalSep,
      thousands_separator: thousandsSep,
    });
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Impostazioni salvate");
    }
    setIsSavingSettings(false);
  }

  useEffect(() => {
    async function init() {
      const res = await fetch("/api/user-roles");
      const { roles } = await res.json();
      if (!roles?.includes("superadmin")) {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);
      loadData();
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

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
      toast.success("Utente aggiornato");
      setEditUser(null);
      loadData();
    }
    setIsSubmitting(false);
  }

  async function handleCreateUser(formData: FormData) {
    setIsSubmitting(true);
    formData.set("organizationId", orgId);
    const result = await createUserAction(formData);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Utente creato con successo");
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
      toast.success(
        currentActive ? "Utente disattivato" : "Utente riattivato"
      );
      loadData();
    }
  }

  async function handleImpersonate(userId: string) {
    const res = await fetch("/api/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.error) {
      toast.error(data.error);
      return;
    }

    // Exchange the token to create a real session as the impersonated user
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: data.tokenHash,
      type: "magiclink",
    });

    if (otpError) {
      toast.error("Errore nell'impersonazione: " + otpError.message);
      return;
    }

    window.location.href = "/dashboard";
  }

  async function handleDelete() {
    if (!deleteUser) return;
    setIsSubmitting(true);
    const result = await deleteUserAction(deleteUser.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Utente eliminato");
      loadData();
    }
    setIsSubmitting(false);
    setDeleteUser(null);
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
      {
        headerName: "Ruoli",
        valueGetter: (params) =>
          params.data?.user_roles
            ?.map((ur) => getRoleLabel(ur.roles.name))
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
        minWidth: 370,
        cellRenderer: (params: ICellRendererParams<User>) => {
          if (!params.data) return null;
          const user = params.data;
          return (
            <div className="flex items-center gap-2 h-full">
              <Tooltip>
                <TooltipTrigger render={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(user)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                } />
                <TooltipContent>Modifica</TooltipContent>
              </Tooltip>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleImpersonate(user.id)}
              >
                <UserCheck className="h-4 w-4 mr-1" />
                Impersona
              </Button>
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
              <Tooltip>
                <TooltipTrigger render={
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteUser(user)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                } />
                <TooltipContent>Elimina</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  if (!authorized || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Organizzazione non trovata</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger render={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/superadmin")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          } />
          <TooltipContent>Torna alle organizzazioni</TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold">{org.name}</h1>
            <p className="text-sm text-muted-foreground">Gestione organizzazione</p>
          </div>
          <Tooltip>
            <TooltipTrigger render={
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setNewName(org.name);
                  setRenameDialogOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            } />
            <TooltipContent>Rinomina</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Utenti</CardTitle>
              <CardDescription>
                {users.length} utenti in questa organizzazione
              </CardDescription>
            </div>
            <Dialog
              open={createDialogOpen}
              onOpenChange={setCreateDialogOpen}
            >
              <DialogTrigger render={<Button />}>
                <Plus className="h-4 w-4 mr-2" />
                Nuovo Utente
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crea Nuovo Utente</DialogTitle>
                  <DialogDescription>
                    L&apos;utente riceverà un invito via email
                  </DialogDescription>
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
                  <div className="space-y-2">
                    <Label>Ruoli</Label>
                    <div className="space-y-2">
                      {AVAILABLE_ROLES.map((role) => (
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
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateDialogOpen(false)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Annulla
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      <UserPlus className="h-4 w-4 mr-1" />
                      {isSubmitting ? "Creazione..." : "Crea Utente"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <DataGrid
            rowData={users}
            columnDefs={columnDefs}
            exportFileName={`utenti-${org.slug}`}
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
                <div className="flex gap-1 flex-wrap">
                  {user.user_roles.map((ur) => (
                    <Badge key={ur.roles.name} variant="outline">
                      {getRoleLabel(ur.roles.name)}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(user)}>
                    <Pencil className="h-4 w-4 mr-1" /> Modifica
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleImpersonate(user.id)}>
                    <UserCheck className="h-4 w-4 mr-1" /> Impersona
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleToggle(user.id, user.is_active)}>
                    {user.is_active ? "Disattiva" : "Riattiva"}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteUser(user)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          />
        </CardContent>
      </Card>

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
            <DialogTitle>Modifica Utente</DialogTitle>
            <DialogDescription>
              {editUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cognome</Label>
                <Input
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ruoli</Label>
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
                    {role.label}
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Scadenza password</Label>
              <Input
                type="date"
                value={editPasswordExpiry}
                onChange={(e) => setEditPasswordExpiry(e.target.value)}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Imposta nuova password</Label>
              <Input
                type="password"
                value={editNewPassword}
                onChange={(e) => setEditNewPassword(e.target.value)}
                placeholder="Lascia vuoto per non modificare"
              />
              <p className="text-xs text-muted-foreground">
                Se impostata, la password risulterà scaduta e l&apos;utente dovrà cambiarla al primo accesso.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              <X className="h-4 w-4 mr-1" />
              Annulla
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSubmitting}>
              <Save className="h-4 w-4 mr-1" />
              {isSubmitting ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Impostazioni regionali</CardTitle>
          <CardDescription>
            Valuta, formato data/ora e separatori per questa organizzazione
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Lingua</Label>
              <Select value={locale} onValueChange={(v) => v && handleLocaleChange(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {SUPPORTED_LOCALES.find((l) => l.value === locale)?.label ?? locale}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LOCALES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valuta</Label>
              <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
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

            <div className="space-y-2">
              <Label>Formato data</Label>
              <Select value={dateFormat} onValueChange={(v) => v && setDateFormat(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {DATE_FORMATS.find((f) => f.value === dateFormat)?.label ?? dateFormat}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DATE_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Formato ora</Label>
              <Select value={timeFormat} onValueChange={(v) => v && setTimeFormat(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {TIME_FORMATS.find((f) => f.value === timeFormat)?.label ?? timeFormat}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIME_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Separatore decimale</Label>
              <Select value={decimalSep} onValueChange={(v) => v && setDecimalSep(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {DECIMAL_SEPARATORS.find((s) => s.value === decimalSep)?.label ?? decimalSep}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DECIMAL_SEPARATORS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Separatore migliaia</Label>
              <Select value={thousandsSep} onValueChange={(v) => v !== null && setThousandsSep(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {THOUSANDS_SEPARATORS.find((s) => s.value === thousandsSep)?.label ?? thousandsSep}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {THOUSANDS_SEPARATORS.map((s) => (
                    <SelectItem key={s.value || "none"} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
              <Save className="h-4 w-4 mr-1" />
              {isSavingSettings ? "Salvataggio..." : "Salva impostazioni"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Rename Organization Dialog */}
      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRenameDialogOpen(false);
            setNewName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rinomina organizzazione</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="newOrgName">Nuovo nome</Label>
            <Input
              id="newOrgName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              <X className="h-4 w-4 mr-1" />
              Annulla
            </Button>
            <Button onClick={handleRename} disabled={isRenaming || !newName.trim()}>
              <Save className="h-4 w-4 mr-1" />
              {isRenaming ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteUser}
        onOpenChange={(open) => !open && setDeleteUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferma eliminazione</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare l&apos;utente{" "}
              <strong>
                {deleteUser?.first_name} {deleteUser?.last_name}
              </strong>
              ? Questa azione è irreversibile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>
              <X className="h-4 w-4 mr-1" />
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {isSubmitting ? "Eliminazione..." : "Elimina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
