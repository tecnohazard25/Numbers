"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Loader2,
  Check,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  processEntitiesImportAction,
  confirmEntitiesImportAction,
} from "@/app/actions/entities-import";
import type { ParsedEntity, ImportPreview, ImportReport } from "@/app/actions/entities-import";
import type { EntityType } from "@/types/supabase";
import { useTranslation } from "@/lib/i18n/context";

type Step = "upload" | "processing" | "preview" | "report";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: EntityType;
  orgId: string;
  onComplete: () => void;
}

export function EntitiesImportDialog({ open, onOpenChange, entityType, orgId, onComplete }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [hasError, setHasError] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep("upload");
      setFile(null);
      setProgressMessages([]);
      setHasError(false);
      setPreview(null);
      setReport(null);
      setIsProcessing(false);
    }
  }, [open]);

  const addMessage = useCallback((msg: string) => {
    setProgressMessages((prev) => [...prev, msg]);
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "xlsx", "xls"].includes(ext ?? "")) {
      toast.error(t("settings.entities.import.invalidFormat"));
      return;
    }
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "xlsx", "xls"].includes(ext ?? "")) {
      toast.error(t("settings.entities.import.invalidFormat"));
      return;
    }
    setFile(f);
  }

  async function handleStart() {
    if (!file) return;
    setStep("processing");
    setIsProcessing(true);
    setHasError(false);
    setProgressMessages([]);

    addMessage(t("settings.entities.import.sendingToAI"));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityType", entityType);

    const result = await processEntitiesImportAction(formData);

    if (!result.success) {
      setHasError(true);
      addMessage(`❌ ${result.error}`);
      setIsProcessing(false);
      return;
    }

    addMessage(`✅ ${result.preview.entities.length} ${t("settings.entities.import.parsingResults")}`);
    addMessage(`${t("settings.entities.import.dedup")}`);
    addMessage(`✅ ${t("settings.entities.import.ready")}`);

    setPreview(result.preview);
    setIsProcessing(false);
    setStep("preview");
  }

  async function handleConfirm() {
    if (!preview) return;
    setIsProcessing(true);

    const result = await confirmEntitiesImportAction({
      entities: preview.entities,
      entityType,
    });

    if (!result.success) {
      toast.error(result.error);
      setIsProcessing(false);
      return;
    }

    setReport(result.report);
    setStep("report");
    setIsProcessing(false);
  }

  function handleClose() {
    onOpenChange(false);
    if (step === "report") {
      onComplete();
    }
  }

  // Progress animation
  const stepProgress = Math.min(progressMessages.length * 25, 75);
  const [animatedExtra, setAnimatedExtra] = useState(0);

  useEffect(() => {
    if (hasError || !isProcessing) {
      setAnimatedExtra(0);
      return;
    }
    if (stepProgress >= 75) {
      const interval = setInterval(() => {
        setAnimatedExtra((prev) => {
          const next = prev + 0.5;
          return next > 20 ? 0 : next;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [hasError, isProcessing, stepProgress]);

  const totalProgress = hasError ? 100 : isProcessing ? Math.min(stepProgress + animatedExtra, 95) : 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("settings.entities.import.title")}</DialogTitle>
        </DialogHeader>

        {/* Upload Step */}
        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("settings.entities.import.description")}
            </p>

            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xlsx,.xls"
                className="hidden"
                onChange={handleFileSelect}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t("settings.entities.import.dropOrClick")}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">
                {t("common.cancel")}
              </Button>
              <Button onClick={handleStart} disabled={!file} className="cursor-pointer">
                {t("settings.entities.import.start")}
              </Button>
            </div>
          </div>
        )}

        {/* Processing Step */}
        {step === "processing" && (
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${hasError ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${totalProgress}%` }}
              />
            </div>

            {/* Messages */}
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {progressMessages.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {msg.startsWith("✅") ? (
                    <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  ) : msg.startsWith("❌") ? (
                    <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  ) : (
                    <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0 mt-0.5" />
                  )}
                  <span>{msg.replace(/^[✅❌]\s*/, "")}</span>
                </div>
              ))}
            </div>

            {hasError && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={handleClose} className="cursor-pointer">
                  {t("common.close")}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Preview Step */}
        {step === "preview" && preview && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                <div className="text-2xl font-bold text-green-600">{preview.totalNew}</div>
                <div className="text-xs text-muted-foreground">{t("settings.entities.import.new")}</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <div className="text-2xl font-bold text-blue-600">{preview.totalExisting}</div>
                <div className="text-xs text-muted-foreground">{t("settings.entities.import.existing")}</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <div className="text-2xl font-bold text-amber-600">{preview.totalSkipped}</div>
                <div className="text-xs text-muted-foreground">{t("settings.entities.import.skipped")}</div>
              </div>
            </div>

            {/* Unresolved FKs */}
            {preview.unresolvedFks.length > 0 && (
              <div className="border border-amber-300 dark:border-amber-700 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  {t("settings.entities.import.unresolvedFk")} ({preview.unresolvedFks.length})
                </div>
                <div className="max-h-24 overflow-y-auto space-y-0.5">
                  {preview.unresolvedFks.map((fk, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{fk}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Entity list */}
            <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
              {preview.entities.map((entity, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant={entity.status === "new" ? "default" : "secondary"}
                      className="text-xs shrink-0"
                    >
                      {entity.status === "new" ? t("settings.entities.import.new") : t("settings.entities.import.existing")}
                    </Badge>
                    <span className="font-mono text-xs shrink-0">{entity.code}</span>
                    <span className="truncate">{entity.name}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose} className="cursor-pointer">
                {t("common.cancel")}
              </Button>
              <Button onClick={handleConfirm} disabled={isProcessing} className="cursor-pointer">
                {isProcessing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                {t("settings.entities.import.confirmImport")}
              </Button>
            </div>
          </div>
        )}

        {/* Report Step */}
        {step === "report" && report && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              <span className="font-medium">{t("settings.entities.import.completed")}</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                <div className="text-2xl font-bold text-green-600">{report.inserted}</div>
                <div className="text-xs text-muted-foreground">{t("settings.entities.import.inserted")}</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <div className="text-2xl font-bold text-blue-600">{report.updated}</div>
                <div className="text-xs text-muted-foreground">{t("settings.entities.import.updatedCount")}</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-2xl font-bold">{report.skipped}</div>
                <div className="text-xs text-muted-foreground">{t("settings.entities.import.skipped")}</div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleClose} className="cursor-pointer">
                {t("common.close")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
