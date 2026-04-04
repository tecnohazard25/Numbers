"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function canManageTransactions(roles: string[]): boolean {
  return roles.includes("accountant");
}

export async function uploadTransactionAttachmentAction(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageTransactions(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const transactionId = formData.get("transactionId") as string;
  const file = formData.get("file") as File;

  if (!transactionId || !file) {
    return { error: "Dati mancanti" };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { error: "Tipo file non consentito. Formati accettati: PDF, JPEG, PNG, WEBP" };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { error: "File troppo grande. Dimensione massima: 10MB" };
  }

  const admin = createAdminClient();

  // Verify transaction belongs to org
  const { data: transaction } = await admin
    .from("transactions")
    .select("organization_id")
    .eq("id", transactionId)
    .single();

  if (!transaction || transaction.organization_id !== organizationId) {
    return { error: "Movimento non trovato" };
  }

  const fileId = crypto.randomUUID();
  const ext = file.name.split(".").pop() || "";
  const storagePath = `${organizationId}/${transactionId}/${fileId}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from("transaction-attachments")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return { error: `Errore nel caricamento: ${uploadError.message}` };
  }

  const { data: attachment, error: dbError } = await admin
    .from("transaction_attachments")
    .insert({
      transaction_id: transactionId,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: currentUser.profile.id,
    })
    .select()
    .single();

  if (dbError) {
    // Rollback storage upload
    await admin.storage.from("transaction-attachments").remove([storagePath]);
    return { error: `Errore nel salvataggio: ${dbError.message}` };
  }

  revalidatePath("/transactions");
  return { success: true, attachment };
}

// Note: download is intentionally available to all org users (not just accountant)
// because viewing attachments is a read-only operation
export async function getAttachmentSignedUrlAction(attachmentId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const admin = createAdminClient();

  const { data: attachment } = await admin
    .from("transaction_attachments")
    .select("file_path, file_name, transaction_id")
    .eq("id", attachmentId)
    .single();

  if (!attachment) return { error: "Allegato non trovato" };

  // Verify org ownership through transaction
  const { data: transaction } = await admin
    .from("transactions")
    .select("organization_id")
    .eq("id", attachment.transaction_id)
    .single();

  if (!transaction || transaction.organization_id !== organizationId) {
    return { error: "Non autorizzato" };
  }

  const { data: signedUrl, error } = await admin.storage
    .from("transaction-attachments")
    .createSignedUrl(attachment.file_path, 60);

  if (error || !signedUrl) {
    return { error: "Errore nella generazione del link di download" };
  }

  return { success: true, url: signedUrl.signedUrl, fileName: attachment.file_name };
}

export async function deleteTransactionAttachmentAction(attachmentId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageTransactions(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const admin = createAdminClient();

  const { data: attachment } = await admin
    .from("transaction_attachments")
    .select("file_path, transaction_id")
    .eq("id", attachmentId)
    .single();

  if (!attachment) return { error: "Allegato non trovato" };

  // Verify org ownership through transaction
  const { data: transaction } = await admin
    .from("transactions")
    .select("organization_id")
    .eq("id", attachment.transaction_id)
    .single();

  if (!transaction || transaction.organization_id !== organizationId) {
    return { error: "Non autorizzato" };
  }

  // Delete from storage
  await admin.storage.from("transaction-attachments").remove([attachment.file_path]);

  // Delete DB row
  const { error } = await admin
    .from("transaction_attachments")
    .delete()
    .eq("id", attachmentId);

  if (error) {
    return { error: `Errore nell'eliminazione: ${error.message}` };
  }

  revalidatePath("/transactions");
  return { success: true };
}
