"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { TransactionDirection } from "@/types/supabase";

function canManageTransactions(roles: string[]): boolean {
  return roles.includes("accountant");
}

export interface TransactionInput {
  collection_resource_id: string;
  subject_id?: string | null;
  direction: TransactionDirection;
  amount: number;
  transaction_date: string;
  description: string;
  reference?: string | null;
  is_balance_row?: boolean;
  reclassification_node_id?: string | null;
}

export async function createTransactionAction(data: TransactionInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageTransactions(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  if (!data.collection_resource_id) return { error: "Risorsa di incasso obbligatoria" };
  if (!data.direction) return { error: "Direzione obbligatoria" };
  if (!data.amount || data.amount <= 0) return { error: "Importo deve essere maggiore di zero" };
  if (!data.transaction_date) return { error: "Data movimento obbligatoria" };
  if (!data.description?.trim()) return { error: "Descrizione obbligatoria" };

  const admin = createAdminClient();

  // Verify collection resource belongs to org
  const { data: resource } = await admin
    .from("collection_resources")
    .select("organization_id")
    .eq("id", data.collection_resource_id)
    .single();

  if (!resource || resource.organization_id !== organizationId) {
    return { error: "Risorsa di incasso non trovata" };
  }

  const { data: transaction, error } = await admin
    .from("transactions")
    .insert({
      organization_id: organizationId,
      collection_resource_id: data.collection_resource_id,
      subject_id: data.subject_id || null,
      direction: data.direction,
      amount: data.amount,
      transaction_date: data.transaction_date,
      description: data.description.trim(),
      reference: data.reference?.trim() || null,
      is_balance_row: data.is_balance_row ?? false,
      reclassification_node_id: data.reclassification_node_id || null,
      created_by: currentUser.profile.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: `Errore nella creazione: ${error.message}` };
  }

  revalidatePath("/transactions");
  return { success: true, id: transaction.id };
}

export async function updateTransactionAction(
  transactionId: string,
  data: TransactionInput
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageTransactions(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  if (!data.collection_resource_id) return { error: "Risorsa di incasso obbligatoria" };
  if (!data.direction) return { error: "Direzione obbligatoria" };
  if (!data.amount || data.amount <= 0) return { error: "Importo deve essere maggiore di zero" };
  if (!data.transaction_date) return { error: "Data movimento obbligatoria" };
  if (!data.description?.trim()) return { error: "Descrizione obbligatoria" };

  const admin = createAdminClient();

  // Verify transaction belongs to org
  const { data: existing } = await admin
    .from("transactions")
    .select("organization_id")
    .eq("id", transactionId)
    .single();

  if (!existing || existing.organization_id !== organizationId) {
    return { error: "Movimento non trovato" };
  }

  const { error } = await admin
    .from("transactions")
    .update({
      collection_resource_id: data.collection_resource_id,
      subject_id: data.subject_id || null,
      direction: data.direction,
      amount: data.amount,
      transaction_date: data.transaction_date,
      description: data.description.trim(),
      reference: data.reference?.trim() || null,
      is_balance_row: data.is_balance_row ?? false,
      reclassification_node_id: data.reclassification_node_id || null,
    })
    .eq("id", transactionId);

  if (error) {
    return { error: `Errore nell'aggiornamento: ${error.message}` };
  }

  revalidatePath("/transactions");
  return { success: true };
}

export async function deleteTransactionAction(transactionId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageTransactions(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("transactions")
    .select("organization_id")
    .eq("id", transactionId)
    .single();

  if (!existing || existing.organization_id !== organizationId) {
    return { error: "Movimento non trovato" };
  }

  // Delete attachments from storage first
  const { data: attachments } = await admin
    .from("transaction_attachments")
    .select("file_path")
    .eq("transaction_id", transactionId);

  if (attachments && attachments.length > 0) {
    const paths = attachments.map((a) => a.file_path);
    await admin.storage.from("transaction-attachments").remove(paths);
  }

  // Physical delete (cascade will remove attachment rows)
  const { error } = await admin
    .from("transactions")
    .delete()
    .eq("id", transactionId);

  if (error) {
    return { error: `Errore nell'eliminazione: ${error.message}` };
  }

  revalidatePath("/transactions");
  return { success: true };
}

export async function deleteTransactionsAction(transactionIds: string[]) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageTransactions(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  if (transactionIds.length === 0) return { error: "Nessun movimento selezionato" };

  const admin = createAdminClient();

  // Verify all belong to org
  const { data: existing } = await admin
    .from("transactions")
    .select("id, organization_id")
    .in("id", transactionIds);

  const validIds = (existing ?? [])
    .filter((t) => t.organization_id === organizationId)
    .map((t) => t.id);

  if (validIds.length === 0) return { error: "Movimenti non trovati" };

  // Delete attachments from storage
  const { data: attachments } = await admin
    .from("transaction_attachments")
    .select("file_path")
    .in("transaction_id", validIds);

  if (attachments && attachments.length > 0) {
    const paths = attachments.map((a) => a.file_path);
    await admin.storage.from("transaction-attachments").remove(paths);
  }

  // Delete all in one query (cascade removes attachment rows)
  const { error } = await admin
    .from("transactions")
    .delete()
    .in("id", validIds);

  if (error) {
    return { error: `Errore nell'eliminazione: ${error.message}` };
  }

  revalidatePath("/transactions");
  return { success: true, deleted: validIds.length };
}
