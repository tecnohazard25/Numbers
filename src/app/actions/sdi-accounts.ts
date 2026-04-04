"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

function canManageSdiAccounts(roles: string[]): boolean {
  return roles.includes("accountant");
}

interface SdiAccountInput {
  name: string;
  code: string;
  pec?: string | null;
}

export async function createSdiAccountAction(data: SdiAccountInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageSdiAccounts(currentUser.roles)) return { error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  if (!data.name?.trim()) return { error: "Nome obbligatorio" };
  if (!data.code?.trim()) return { error: "Codice SDI obbligatorio" };
  if (data.code.trim().length !== 7) return { error: "Il codice SDI deve essere di 7 caratteri" };

  const admin = createAdminClient();

  const { data: account, error } = await admin
    .from("sdi_accounts")
    .insert({
      organization_id: organizationId,
      name: data.name.trim(),
      code: data.code.trim().toUpperCase(),
      pec: data.pec?.trim() || null,
      created_by: currentUser.profile.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Esiste già un account SDI con questo codice" };
    }
    return { error: `Errore nella creazione: ${error.message}` };
  }

  revalidatePath("/settings");
  return { success: true, account };
}

export async function updateSdiAccountAction(accountId: string, data: SdiAccountInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageSdiAccounts(currentUser.roles)) return { error: "Non autorizzato" };

  if (!data.name?.trim()) return { error: "Nome obbligatorio" };
  if (!data.code?.trim()) return { error: "Codice SDI obbligatorio" };
  if (data.code.trim().length !== 7) return { error: "Il codice SDI deve essere di 7 caratteri" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("sdi_accounts")
    .select("organization_id")
    .eq("id", accountId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Account non trovato" };
  }

  const { data: account, error } = await admin
    .from("sdi_accounts")
    .update({
      name: data.name.trim(),
      code: data.code.trim().toUpperCase(),
      pec: data.pec?.trim() || null,
    })
    .eq("id", accountId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Esiste già un account SDI con questo codice" };
    }
    return { error: `Errore nell'aggiornamento: ${error.message}` };
  }

  revalidatePath("/settings");
  return { success: true, account };
}

export async function deleteSdiAccountAction(accountId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageSdiAccounts(currentUser.roles)) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("sdi_accounts")
    .select("organization_id")
    .eq("id", accountId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Account non trovato" };
  }

  const { error } = await admin
    .from("sdi_accounts")
    .delete()
    .eq("id", accountId);

  if (error) {
    if (error.code === "23503") {
      return { error: "Impossibile eliminare: l'account ha fatture associate" };
    }
    return { error: `Errore nell'eliminazione: ${error.message}` };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function toggleSdiAccountActiveAction(accountId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageSdiAccounts(currentUser.roles)) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("sdi_accounts")
    .select("organization_id, is_active")
    .eq("id", accountId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Account non trovato" };
  }

  const newActive = !existing.is_active;
  const { error } = await admin
    .from("sdi_accounts")
    .update({ is_active: newActive })
    .eq("id", accountId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: true, is_active: newActive };
}
