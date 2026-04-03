"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

function canManagePaymentTypes(roles: string[]): boolean {
  return roles.includes("accountant");
}

interface PaymentTypeInput {
  name: string;
  code: string;
}

export async function createPaymentTypeAction(data: PaymentTypeInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManagePaymentTypes(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  if (!data.name?.trim()) return { error: "Nome obbligatorio" };
  if (!data.code?.trim()) return { error: "Codice obbligatorio" };

  const admin = createAdminClient();

  const { data: paymentType, error } = await admin
    .from("payment_types")
    .insert({
      organization_id: organizationId,
      name: data.name.trim(),
      code: data.code.trim().toLowerCase(),
      created_by: currentUser.profile.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Esiste già un tipo di pagamento con questo codice" };
    }
    return { error: `Errore nella creazione: ${error.message}` };
  }

  revalidatePath("/settings");
  return { success: true, paymentType };
}

export async function updatePaymentTypeAction(
  paymentTypeId: string,
  data: PaymentTypeInput
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManagePaymentTypes(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("payment_types")
    .select("organization_id")
    .eq("id", paymentTypeId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Tipo di pagamento non trovato" };
  }

  if (!data.name?.trim()) return { error: "Nome obbligatorio" };
  if (!data.code?.trim()) return { error: "Codice obbligatorio" };

  const { data: paymentType, error } = await admin
    .from("payment_types")
    .update({
      name: data.name.trim(),
      code: data.code.trim().toLowerCase(),
    })
    .eq("id", paymentTypeId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Esiste già un tipo di pagamento con questo codice" };
    }
    return { error: `Errore nell'aggiornamento: ${error.message}` };
  }

  revalidatePath("/settings");
  return { success: true, paymentType };
}

export async function togglePaymentTypeActiveAction(paymentTypeId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManagePaymentTypes(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("payment_types")
    .select("organization_id, is_active")
    .eq("id", paymentTypeId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Tipo di pagamento non trovato" };
  }

  const newActive = !existing.is_active;
  const { error } = await admin
    .from("payment_types")
    .update({
      is_active: newActive,
      deleted_at: newActive ? null : new Date().toISOString(),
    })
    .eq("id", paymentTypeId);

  if (error) {
    return { error: `Errore nell'aggiornamento: ${error.message}` };
  }

  revalidatePath("/settings");
  return { success: true, is_active: newActive };
}

const DEFAULT_PAYMENT_TYPES = [
  { name: "Contanti", code: "cash" },
  { name: "Bonifico Bancario", code: "bank_transfer" },
  { name: "Carta di Credito", code: "credit_card" },
  { name: "Carta di Debito", code: "debit_card" },
  { name: "POS", code: "pos" },
  { name: "Assegno", code: "check" },
  { name: "Pagamento Online", code: "online_payment" },
  { name: "Addebito Diretto (RID/SDD)", code: "direct_debit" },
  { name: "Altro", code: "other" },
];

export async function seedPaymentTypesAction() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManagePaymentTypes(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const admin = createAdminClient();

  const rows = DEFAULT_PAYMENT_TYPES.map((r) => ({
    organization_id: organizationId,
    name: r.name,
    code: r.code,
    created_by: currentUser.profile.id,
  }));

  const { error } = await admin.from("payment_types").insert(rows);

  if (error) {
    console.error("Error seeding payment types:", error.message);
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function deletePaymentTypeAction(paymentTypeId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManagePaymentTypes(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("payment_types")
    .select("organization_id")
    .eq("id", paymentTypeId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Tipo di pagamento non trovato" };
  }

  // Try physical delete first; if FK constraint fails, do soft delete
  const { error: deleteError } = await admin
    .from("payment_types")
    .delete()
    .eq("id", paymentTypeId);

  if (deleteError) {
    if (deleteError.code === "23503") {
      const { error: softError } = await admin
        .from("payment_types")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", paymentTypeId);

      if (softError) {
        return { error: `Errore nella disattivazione: ${softError.message}` };
      }
    } else {
      return { error: `Errore nell'eliminazione: ${deleteError.message}` };
    }
  }

  revalidatePath("/settings");
  return { success: true };
}
