"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Save, Tags, Trash2, X, Eye, EyeOff, Power, PowerOff } from "lucide-react";
import {
  createTagAction,
  updateTagAction,
  deleteTagAction,
  toggleTagActiveAction,
} from "@/app/actions/tags";
import { useTranslation } from "@/lib/i18n/context";

const TAG_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
];

interface TagWithCount {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  is_active: boolean;
  usage_count: number;
}

interface Props {
  orgId: string;
}

export function TagsSection({ orgId }: Props) {
  const { t } = useTranslation();
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit/Create state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TagWithCount | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(TAG_COLORS[0]);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<TagWithCount | null>(null);

  // Filter state
  const [showDeactivated, setShowDeactivated] = useState(false);

  const loadData = useCallback(async () => {
    const params = new URLSearchParams({ orgId });
    if (showDeactivated) params.set("includeDeactivated", "true");
    const res = await fetch(`/api/tags?${params}`);
    const data = await res.json();
    setTags(data.tags ?? []);
    setLoading(false);
  }, [orgId, showDeactivated]);

  useEffect(() => { loadData(); }, [loadData]);

  function openCreate() {
    setEditing(null);
    setFormName("");
    setFormColor(TAG_COLORS[0]);
    setFormOpen(true);
  }

  function openEdit(tag: TagWithCount) {
    setEditing(tag);
    setFormName(tag.name);
    setFormColor(tag.color);
    setFormOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setIsSubmitting(true);

    if (editing) {
      const result = await updateTagAction(editing.id, formName, formColor);
      if (result.error) { toast.error(result.error); }
      else { toast.success(t("settings.tags.updated")); setFormOpen(false); loadData(); }
    } else {
      const result = await createTagAction(formName, formColor);
      if (result.error) { toast.error(result.error); }
      else { toast.success(t("settings.tags.created")); setFormOpen(false); loadData(); }
    }
    setIsSubmitting(false);
  }

  async function handleToggleActive(tag: TagWithCount) {
    setIsSubmitting(true);
    const result = await toggleTagActiveAction(tag.id);
    if (result.error) { toast.error(result.error); }
    else {
      toast.success(result.is_active ? t("common.reactivate") : t("common.deactivate"));
      loadData();
    }
    setIsSubmitting(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    const result = await deleteTagAction(deleteTarget.id);
    if (result.error) { toast.error(result.error); }
    else { toast.success(t("settings.tags.deleted")); setDeleteTarget(null); loadData(); }
    setIsSubmitting(false);
  }

  if (loading) {
    return <p className="text-muted-foreground text-center py-8">{t("common.loading")}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Tags className="h-5 w-5" />
            {t("settings.tags.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("settings.tags.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showDeactivated ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowDeactivated(!showDeactivated)}
            title={showDeactivated ? t("settings.paymentTypes.hideDeactivated") : t("settings.paymentTypes.showDeactivated")}
          >
            {showDeactivated ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {t("settings.paymentTypes.deactivated")}
          </Button>
          <Button size="sm" onClick={openCreate}>
            {t("settings.tags.newTag")}
          </Button>
        </div>
      </div>

      {tags.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">{t("common.noData")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className={`flex items-center justify-between gap-3 rounded-lg border border-l-4 px-4 py-3 ${!tag.is_active ? "opacity-50" : ""}`}
              style={{ borderLeftColor: tag.color }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-5 h-5 rounded-full shrink-0 border"
                  style={{ backgroundColor: tag.color }}
                />
                <div className="min-w-0">
                  <span className="font-medium text-sm block truncate">{tag.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {tag.usage_count} {tag.usage_count === 1 ? t("settings.tags.subject") : t("settings.tags.subjects")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(tag)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleToggleActive(tag)}
                  disabled={isSubmitting}
                  title={tag.is_active ? t("common.deactivate") : t("common.reactivate")}
                >
                  {tag.is_active
                    ? <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
                    : <Power className="h-3.5 w-3.5 text-green-600" />
                  }
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(tag)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Tag Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("settings.tags.editTag") : t("settings.tags.newTag")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("common.name")}</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.tags.color")}</Label>
              <div className="flex gap-2">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: c === formColor ? "var(--color-foreground)" : "transparent",
                    }}
                    onClick={() => setFormColor(c)}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">{t("settings.tags.preview")}:</span>
              <Badge style={{ backgroundColor: formColor, color: "#fff" }}>
                {formName || "Tag"}
              </Badge>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={isSubmitting || !formName.trim()}>
              <Save className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.saving") : editing ? t("common.update") : t("common.create")}
            </Button>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4 mr-1" />
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Tag Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.tags.confirmDelete")}</DialogTitle>
            <DialogDescription>
              {t("settings.tags.confirmDeleteDesc")} <strong>{deleteTarget?.name}</strong>?
              {deleteTarget && deleteTarget.usage_count > 0 && (
                <> {t("settings.tags.confirmDeleteInUse", { count: deleteTarget.usage_count })}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
              <Trash2 className="h-4 w-4 mr-1" />
              {isSubmitting ? t("common.deleting") : t("common.delete")}
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
