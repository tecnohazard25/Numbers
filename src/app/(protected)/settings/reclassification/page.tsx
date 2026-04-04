"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Plus,
  Pencil,
  Copy,
  Trash2,
  Star,
  Shield,
  ChevronDown,
  Download,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ReclassificationTemplate } from "@/types/supabase";
import {
  createTemplateAction,
  deleteTemplateAction,
  cloneTemplateAction,
  setBaseTemplateAction,
  seedReclassificationAction,
} from "@/app/actions/reclassification";

export default function ReclassificationPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [isAccountant, setIsAccountant] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<ReclassificationTemplate[]>([]);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<ReclassificationTemplate | null>(null);

  useEffect(() => {
    async function init() {
      const res = await fetch("/api/user-info");
      const data = await res.json();
      const roles: string[] = data.roles ?? [];

      if (
        !roles.includes("accountant") &&
        !roles.includes("user_manager") &&
        !roles.includes("superadmin")
      ) {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);
      setIsAccountant(roles.includes("accountant"));
      setIsSuperadmin(roles.includes("superadmin"));
      setOrgId(data.profile?.organization_id ?? null);
    }
    init();
  }, [router]);

  const loadTemplates = useCallback(async () => {
    const params = new URLSearchParams();
    if (orgId) params.set("orgId", orgId);
    if (isSuperadmin) params.set("includeSystem", "true");
    if (!orgId && !isSuperadmin) return;
    const res = await fetch(`/api/reclassification-templates?${params}`);
    const data = await res.json();
    setTemplates(data.templates ?? []);
    setLoading(false);
  }, [orgId, isSuperadmin]);

  useEffect(() => {
    if (orgId || isSuperadmin) loadTemplates();
  }, [orgId, loadTemplates]);

  async function handleCreate() {
    setIsSubmitting(true);
    const result = await createTemplateAction(formName, formDescription);
    setIsSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t("reclassification.created"));
    setFormOpen(false);
    setFormName("");
    setFormDescription("");
    loadTemplates();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    const result = await deleteTemplateAction(deleteTarget.id);
    setIsSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t("reclassification.deleted"));
    setDeleteTarget(null);
    loadTemplates();
  }

  async function handleClone(template: ReclassificationTemplate) {
    const result = await cloneTemplateAction(template.id);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t("reclassification.cloned"));
    loadTemplates();
  }

  async function handleSetBase(template: ReclassificationTemplate) {
    const result = await setBaseTemplateAction(template.id);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t("reclassification.baseSet"));
    loadTemplates();
  }

  async function handleSeed() {
    setIsSubmitting(true);
    const result = await seedReclassificationAction();
    setIsSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t("reclassification.seedLoaded"));
    loadTemplates();
  }

  if (!authorized || (!orgId && !isSuperadmin)) return null;

  // Superadmin sees all templates (including system); accountant only sees org templates
  const visibleTemplates = isSuperadmin
    ? templates
    : templates.filter((t) => !t.is_template);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6" />
          {t("reclassification.title")}
        </h1>
        {(isAccountant || isSuperadmin) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="sm" />}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {t("reclassification.newSchema")}
              <ChevronDown className="h-3.5 w-3.5 ml-1" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleSeed} disabled={isSubmitting}>
                <Download className="h-4 w-4 mr-2" />
                {t("reclassification.newBase")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t("reclassification.newReclassified")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {t("reclassification.description")}
      </p>

      {loading ? (
        <div className="text-muted-foreground text-sm">{t("common.loading")}</div>
      ) : visibleTemplates.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-muted-foreground">{t("reclassification.noTemplates")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleTemplates.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="font-medium text-left hover:underline hover:text-primary transition-colors"
                    onClick={() => router.push(`/settings/reclassification/${template.id}`)}
                  >
                    {template.name}
                  </button>
                  {template.is_template && (
                    <Badge variant="secondary">
                      <Shield className="h-3 w-3 mr-1" />
                      {t("reclassification.templateBadge")}
                    </Badge>
                  )}
                  {template.is_base && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Badge variant="default" className="cursor-default">
                            <Star className="h-3 w-3 mr-1" />
                            {t("reclassification.base")}
                          </Badge>
                        }
                      />
                      <TooltipContent>{t("reclassification.baseTooltip")}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {template.description && (
                  <span className="text-sm text-muted-foreground">
                    {template.description}
                  </span>
                )}
              </div>

              {/* Actions: superadmin on any, accountant on org templates */}
              {(isSuperadmin || (isAccountant && !template.is_template)) && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      router.push(`/settings/reclassification/${template.id}`)
                    }
                    title={t("common.edit")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {/* Set base (accountant on org templates) */}
                  {!template.is_base && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleSetBase(template)}
                      title={t("reclassification.setAsBase")}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleClone(template)}
                    title={t("reclassification.cloneTemplate")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  {!template.is_template && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(template)}
                      title={t("reclassification.deleteTemplate")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reclassification.newTemplate")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("reclassification.templateName")}</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t("reclassification.templateNamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("reclassification.templateDescription")}</Label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t("reclassification.templateDescriptionPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button
              onClick={handleCreate}
              disabled={isSubmitting || !formName.trim()}
            >
              {isSubmitting ? t("common.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reclassification.confirmDelete")}</DialogTitle>
          </DialogHeader>
          <p>
            {t("reclassification.confirmDeleteDesc").replace(
              "{name}",
              deleteTarget?.name ?? ""
            )}
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
