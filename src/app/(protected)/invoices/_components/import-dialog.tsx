"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileText, X } from "lucide-react";
import { importInvoicesAction, type ImportResult } from "@/app/actions/invoices";
import type { SdiAccount } from "@/types/supabase";
import { useTranslation } from "@/lib/i18n/context";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sdiAccounts: SdiAccount[];
  selectedAccountId?: string;
  onImportComplete: () => void;
}

type Step = "upload" | "processing" | "report";

export function ImportDialog({ open, onOpenChange, sdiAccounts, selectedAccountId, onImportComplete }: Props) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [accountId, setAccountId] = useState(selectedAccountId ?? "");
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setStep("upload");
    setFiles([]);
    setResult(null);
    setAccountId(selectedAccountId ?? "");
  }

  function handleOpenChange(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setFiles(selected);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.toLowerCase().endsWith(".xml") || f.name.toLowerCase().endsWith(".zip")
    );
    setFiles(dropped);
  }

  async function handleImport() {
    if (!accountId || files.length === 0) return;

    setStep("processing");

    const formData = new FormData();
    formData.set("sdiAccountId", accountId);
    for (const file of files) {
      formData.append("files", file);
    }

    const res = await importInvoicesAction(formData);

    if ("error" in res) {
      toast.error(res.error);
      setStep("upload");
      return;
    }

    setResult(res.result);
    setStep("report");
    onImportComplete();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("invoices.importTitle")}</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("invoices.importDescription")}</p>

            <div className="space-y-2">
              <Label>{t("invoices.selectSdiAccount")}</Label>
              <Select value={accountId} onValueChange={(v) => setAccountId(v ?? "")}>
                <SelectTrigger className="!w-full">
                  <SelectValue placeholder={t("invoices.selectSdiAccount")}>
                    {sdiAccounts.find((a) => a.id === accountId)
                      ? `${sdiAccounts.find((a) => a.id === accountId)!.name} (${sdiAccounts.find((a) => a.id === accountId)!.code})`
                      : t("invoices.selectSdiAccount")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sdiAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">{t("invoices.dropOrClick")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("invoices.acceptedFormats")}</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xml,.zip"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-muted-foreground shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
                    <button
                      type="button"
                      className="ml-auto cursor-pointer"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button
                className="cursor-pointer"
                onClick={handleImport}
                disabled={!accountId || files.length === 0}
              >
                <Upload className="h-4 w-4 mr-1" />
                {t("invoices.startImport")}
              </Button>
              <Button variant="outline" className="cursor-pointer" onClick={() => handleOpenChange(false)}>
                {t("common.cancel")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "processing" && (
          <div className="py-8 text-center space-y-4">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
            <p className="text-sm font-medium">{t("invoices.importProcessing")}</p>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
          </div>
        )}

        {step === "report" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">{t("invoices.importCompleted")}</span>
            </div>

            <div className="space-y-2">
              <ReportRow icon="check" label={t("invoices.imported")} value={result.imported} />
              {result.duplicates > 0 && (
                <ReportRow icon="info" label={t("invoices.duplicates")} value={result.duplicates} />
              )}
              {result.nonXmlIgnored.length > 0 && (
                <ReportRow icon="warn" label={t("invoices.nonXmlIgnored")} value={result.nonXmlIgnored.length} />
              )}
              {result.subjectsFound > 0 && (
                <ReportRow icon="check" label={t("invoices.subjectsFound")} value={result.subjectsFound} />
              )}
              {result.subjectsCreated > 0 && (
                <ReportRow icon="info" label={t("invoices.subjectsCreated")} value={result.subjectsCreated} />
              )}
              {result.errors.length > 0 && (
                <>
                  <ReportRow icon="error" label={t("invoices.errors")} value={result.errors.length} />
                  <div className="mt-2 max-h-32 overflow-auto text-xs text-destructive space-y-1">
                    {result.errors.map((e, i) => (
                      <p key={i}>{e}</p>
                    ))}
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button className="cursor-pointer" onClick={() => handleOpenChange(false)}>
                {t("common.confirm")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReportRow({ icon, label, value }: { icon: "check" | "info" | "warn" | "error"; label: string; value: number }) {
  const iconMap = {
    check: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    info: <AlertCircle className="h-4 w-4 text-blue-500" />,
    warn: <AlertCircle className="h-4 w-4 text-yellow-500" />,
    error: <AlertCircle className="h-4 w-4 text-destructive" />,
  };

  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        {iconMap[icon]}
        <span>{label}</span>
      </div>
      <span className="font-mono font-bold">{value}</span>
    </div>
  );
}
