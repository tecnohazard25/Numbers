"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, FileText, Plus, Trash2, Loader2 } from "lucide-react";
import {
  uploadTransactionAttachmentAction,
  getAttachmentSignedUrlAction,
  deleteTransactionAttachmentAction,
} from "@/app/actions/transaction-attachments";
import { useTranslation } from "@/lib/i18n/context";
import type { TransactionAttachment } from "@/types/supabase";

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const MAX_SIZE = 10 * 1024 * 1024;

interface TransactionAttachmentsProps {
  transactionId: string;
  attachments: TransactionAttachment[];
  canEdit: boolean;
  onUpdate: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TransactionAttachments({
  transactionId,
  attachments,
  canEdit,
  onUpdate,
}: TransactionAttachmentsProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(t("transactions.invalidFileType"));
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(t("transactions.fileTooLarge"));
        continue;
      }

      const formData = new FormData();
      formData.set("transactionId", transactionId);
      formData.set("file", file);

      const result = await uploadTransactionAttachmentAction(formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(t("transactions.attachmentUploaded"));
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onUpdate();
  };

  const handleDownload = async (attachmentId: string) => {
    setDownloadingId(attachmentId);
    const result = await getAttachmentSignedUrlAction(attachmentId);
    if (result.error) {
      toast.error(result.error);
    } else if (result.url) {
      const a = document.createElement("a");
      a.href = result.url;
      a.download = result.fileName ?? "download";
      a.target = "_blank";
      a.click();
    }
    setDownloadingId(null);
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm(t("transactions.confirmDeleteAttachment"))) return;
    setDeletingId(attachmentId);
    const result = await deleteTransactionAttachmentAction(attachmentId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("transactions.attachmentDeleted"));
      onUpdate();
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t("transactions.attachments")}</h3>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Plus className="h-3 w-3 mr-1" />
            )}
            {t("transactions.addAttachment")}
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("transactions.noAttachments")}</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 rounded-md border p-2 text-sm"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{att.file_name}</span>
              <span className="text-muted-foreground text-xs shrink-0">
                {formatFileSize(att.file_size)}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleDownload(att.id)}
                disabled={downloadingId === att.id}
              >
                {downloadingId === att.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
              </Button>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(att.id)}
                  disabled={deletingId === att.id}
                >
                  {deletingId === att.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3 text-destructive" />
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
