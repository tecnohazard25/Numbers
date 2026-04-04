"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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
  processImportAction,
  confirmImportAction,
} from "@/app/actions/import-transactions";
import { useTranslation } from "@/lib/i18n/context";
import type {
  CollectionResource,
  ImportPreviewResult,
  ImportPreviewMovement,
} from "@/types/supabase";

type Step = "upload" | "config" | "processing" | "preview" | "report";

function ProcessingStep({
  progressMessages,
  hasError,
  isDone,
  t,
  onClose,
}: {
  progressMessages: string[];
  hasError: boolean;
  isDone: boolean;
  t: (key: string) => string;
  onClose: () => void;
}) {
  // Progress based on real steps: each message = ~20%, cap at 60% before AI responds
  const stepProgress = Math.min(progressMessages.length * 20, 60);
  const [animatedExtra, setAnimatedExtra] = useState(0);

  useEffect(() => {
    if (hasError || isDone) {
      setAnimatedExtra(0);
      return;
    }
    // Once we're waiting for AI (messages done but not complete), animate a pulsing extra
    if (stepProgress >= 60) {
      const interval = setInterval(() => {
        setAnimatedExtra((prev) => {
          // Oscillate between 0 and 30 to show activity
          const next = prev + 0.5;
          return next > 30 ? 0 : next;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [hasError, isDone, stepProgress]);

  const totalProgress = hasError || isDone ? 100 : Math.min(stepProgress + animatedExtra, 95);

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-200 ${
              hasError ? "bg-destructive" : isDone ? "bg-primary" : "bg-primary/80"
            }`}
            style={{ width: `${totalProgress}%` }}
          />
        </div>
        {!hasError && !isDone && (
          <p className="text-xs text-muted-foreground text-center animate-pulse">
            {t("transactions.import.aiProcessing")}
          </p>
        )}
      </div>

      {/* Log messages */}
      <div className="space-y-2">
        {progressMessages.map((msg, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            {msg.startsWith("❌") ? (
              <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            ) : (
              <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            )}
            <span>{msg.replace(/^❌\s*/, "")}</span>
          </div>
        ))}
        {!hasError && !isDone && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("transactions.import.aiProcessing")}</span>
          </div>
        )}
      </div>

      {hasError && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      )}
    </div>
  );
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultResourceId: string;
  resources: CollectionResource[];
  onComplete: () => void;
}


export function ImportDialog({
  open,
  onOpenChange,
  defaultResourceId,
  resources,
  onComplete,
}: ImportDialogProps) {
  const { t, locale } = useTranslation();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [resourceId, setResourceId] = useState(defaultResourceId);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [reportData, setReportData] = useState<{
    inserted: number;
    updated: number;
    notFound: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("upload");
      setFile(null);
      setResourceId(defaultResourceId);
      setPreview(null);
      setProgressMessages([]);
      setReportData(null);
    }
  }, [open, defaultResourceId]);

  const addProgress = useCallback((msg: string) => {
    setProgressMessages((prev) => [...prev, msg]);
  }, []);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleFileSelect = (f: File) => {
    const isValid =
      f.type === "application/pdf" ||
      f.name.endsWith(".xlsx") ||
      f.name.endsWith(".xls");
    if (!isValid) {
      toast.error(t("transactions.import.invalidFormat"));
      return;
    }
    setFile(f);
    setStep("config");
  };

  const handleStartImport = async () => {
    if (!file || !resourceId) return;
    setStep("processing");
    setProgressMessages([]);

    const ext = file.name.split(".").pop()?.toLowerCase();
    const fileType = ext === "pdf" ? "PDF" : "Excel";
    addProgress(`${t("transactions.import.fileUploaded")} (${fileType}, ${(file.size / 1024 / 1024).toFixed(1)} MB)`);

    addProgress(t("transactions.import.loadingChart"));
    addProgress(t("transactions.import.sendingToAI"));

    const formData = new FormData();
    formData.set("file", file);
    formData.set("collectionResourceId", resourceId);

    const result = await processImportAction(formData);

    if (!result.success) {
      addProgress(`❌ ${result.error}`);
      toast.error(result.error);
      return;
    }

    const p = result.preview;
    const newCount = p.movements.filter((m) => m.status === "new").length;
    const updCount = p.movements.filter((m) => m.status === "updated").length;

    addProgress(`${t("transactions.import.movementsReceived")} ${p.movements.length}`);
    addProgress(`${t("transactions.import.dedupResult")} ${updCount} ${t("transactions.import.duplicates")}, ${newCount} ${t("transactions.import.newMovements")}`);
    addProgress(t("transactions.import.readyForPreview"));

    setPreview(p);

    // Auto-advance to preview after a brief delay
    setTimeout(() => setStep("preview"), 500);
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setStep("processing");
    addProgress(t("transactions.import.writing"));

    const result = await confirmImportAction(resourceId, preview.movements);

    if (!result.success) {
      addProgress(`❌ ${result.error}`);
      toast.error(result.error);
      return;
    }

    setReportData({
      inserted: result.inserted,
      updated: result.updated,
      notFound: preview.notFoundInFile.length,
    });
    onComplete(); // Reload transactions immediately
    setStep("report");
    toast.success(t("transactions.import.completed"));
  };

  const fmtCurrency = (v: number) =>
    v.toLocaleString(locale, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    });

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(locale);

  return (
    <Dialog open={open} onOpenChange={(v) => { /* only close via explicit buttons */ if (v) onOpenChange(v); }}>
      <DialogContent
        className="sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{t("transactions.import.title")}</DialogTitle>
            <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription>
            {t("transactions.import.description")}
          </DialogDescription>
        </DialogHeader>

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">{t("transactions.import.dropOrClick")}</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, Excel (.xlsx, .xls)</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
          </div>
        )}

        {/* Step: Config */}
        {step === "config" && file && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-md border p-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => { setFile(null); setStep("upload"); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{t("transactions.collectionResource")} *</Label>
              <Select value={resourceId} onValueChange={(v) => setResourceId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("transactions.selectResource")}>
                    {resourceId
                      ? (() => {
                          const r = resources.find((r) => r.id === resourceId);
                          return r ? `${r.name} (${r.code})` : "";
                        })()
                      : t("transactions.selectResource")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {resources.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setFile(null); setStep("upload"); }}>
                {t("common.back")}
              </Button>
              <Button onClick={handleStartImport} disabled={!resourceId}>
                {t("transactions.import.start")}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Processing */}
        {step === "processing" && (
          <ProcessingStep
            progressMessages={progressMessages}
            hasError={progressMessages.some((m) => m.startsWith("❌"))}
            isDone={!!preview}
            t={t}
            onClose={() => onOpenChange(false)}
          />
        )}

        {/* Step: Preview */}
        {step === "preview" && preview && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {preview.movements.filter((m) => m.status === "new").length}
                </p>
                <p className="text-xs text-muted-foreground">{t("transactions.import.newMovements")}</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {preview.movements.filter((m) => m.status === "updated").length}
                </p>
                <p className="text-xs text-muted-foreground">{t("transactions.import.toUpdate")}</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">
                  {preview.notFoundInFile.length}
                </p>
                <p className="text-xs text-muted-foreground">{t("transactions.import.notInFile")}</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold">
                  {preview.movements.length}
                </p>
                <p className="text-xs text-muted-foreground">{t("transactions.import.total")}</p>
              </div>
            </div>

            {/* Totals verification */}
            {preview.bankStatement && preview.documentTotals && (
              <div className={`rounded-md border p-3 ${preview.totalsMatch ? "border-green-500/50" : "border-amber-500"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {preview.totalsMatch ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-sm font-medium">{t("transactions.import.totalsVerification")}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div />
                  <div className="text-center text-muted-foreground">{t("transactions.import.fromFile")}</div>
                  <div className="text-center text-muted-foreground">{t("transactions.import.calculated")}</div>

                  <div className="text-muted-foreground">{t("transactions.totalIn")}</div>
                  <div className="text-center">{fmtCurrency(preview.documentTotals.totalIn)}</div>
                  <div className="text-center">{fmtCurrency(preview.calculatedTotals.totalIn)}</div>

                  <div className="text-muted-foreground">{t("transactions.totalOut")}</div>
                  <div className="text-center">{fmtCurrency(preview.documentTotals.totalOut)}</div>
                  <div className="text-center">{fmtCurrency(preview.calculatedTotals.totalOut)}</div>
                </div>
              </div>
            )}

            {/* Not found in file warning */}
            {preview.notFoundInFile.length > 0 && (
              <div className="rounded-md border border-amber-500/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">{t("transactions.import.notInFileTitle")}</span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {preview.notFoundInFile.map((tx) => (
                    <div key={tx.id} className="text-xs text-muted-foreground flex gap-2">
                      <span>{fmtDate(tx.transaction_date)}</span>
                      <span className={tx.direction === "in" ? "text-green-600" : "text-red-600"}>
                        {tx.direction === "in" ? "+" : "-"}{fmtCurrency(tx.amount)}
                      </span>
                      <span className="truncate">{tx.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Movement list */}
            <div className="max-h-60 overflow-y-auto space-y-1 rounded-md border p-2">
              {preview.movements.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted/50">
                  <Badge
                    className={
                      m.status === "new"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px]"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]"
                    }
                  >
                    {m.status === "new" ? t("transactions.import.new") : t("transactions.import.update")}
                  </Badge>
                  <span className="w-20 shrink-0">{fmtDate(m.transaction_date)}</span>
                  <span
                    className={`w-24 shrink-0 text-right ${
                      m.direction === "in" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {m.direction === "in" ? "+" : "-"}{fmtCurrency(m.amount)}
                  </span>
                  <span className="flex-1 min-w-0 truncate" title={m.description}>{m.description}</span>
                  {m.suggested_node_full_code && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {m.suggested_node_full_code}
                    </Badge>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleConfirm}>
                {t("transactions.import.confirmImport")}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Report */}
        {step === "report" && reportData && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{reportData.inserted}</p>
                <p className="text-xs text-muted-foreground">{t("transactions.import.inserted")}</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{reportData.updated}</p>
                <p className="text-xs text-muted-foreground">{t("transactions.import.updatedCount")}</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{reportData.notFound}</p>
                <p className="text-xs text-muted-foreground">{t("transactions.import.notInFile")}</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => { onOpenChange(false); onComplete(); }}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
