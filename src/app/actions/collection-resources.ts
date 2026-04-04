"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { validateIbanAction } from "./iban";
import type { CollectionResourceType } from "@/types/supabase";

function canManageCollectionResources(roles: string[]): boolean {
  return roles.includes("accountant");
}

interface CollectionResourceInput {
  name: string;
  code: string;
  type: CollectionResourceType;
  iban?: string | null;
}

export async function createCollectionResourceAction(data: CollectionResourceInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageCollectionResources(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  if (!data.name?.trim()) return { error: "Nome obbligatorio" };
  if (!data.code?.trim()) return { error: "Codice obbligatorio" };
  if (!data.type) return { error: "Tipo obbligatorio" };

  // IBAN validation for bank accounts
  if (data.type === "bank_account") {
    if (!data.iban?.trim()) return { error: "IBAN obbligatorio per conti correnti bancari" };
    const ibanResult = await validateIbanAction(data.iban);
    if (!ibanResult.valid) return { error: ibanResult.error ?? "IBAN non valido" };
  }

  const admin = createAdminClient();

  const { data: resource, error } = await admin
    .from("collection_resources")
    .insert({
      organization_id: organizationId,
      name: data.name.trim(),
      code: data.code.trim().toUpperCase(),
      type: data.type,
      iban: data.type === "bank_account" ? data.iban?.replace(/[\s-]/g, "").toUpperCase() : null,
      created_by: currentUser.profile.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Esiste già una risorsa con questo codice" };
    }
    return { error: `Errore nella creazione: ${error.message}` };
  }

  revalidatePath("/settings");
  return { success: true, resource };
}

export async function updateCollectionResourceAction(
  resourceId: string,
  data: CollectionResourceInput
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageCollectionResources(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  if (!data.name?.trim()) return { error: "Nome obbligatorio" };
  if (!data.code?.trim()) return { error: "Codice obbligatorio" };
  if (!data.type) return { error: "Tipo obbligatorio" };

  // IBAN validation for bank accounts
  if (data.type === "bank_account") {
    if (!data.iban?.trim()) return { error: "IBAN obbligatorio per conti correnti bancari" };
    const ibanResult = await validateIbanAction(data.iban);
    if (!ibanResult.valid) return { error: ibanResult.error ?? "IBAN non valido" };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("collection_resources")
    .select("organization_id")
    .eq("id", resourceId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Risorsa non trovata" };
  }

  const { data: resource, error } = await admin
    .from("collection_resources")
    .update({
      name: data.name.trim(),
      code: data.code.trim().toUpperCase(),
      type: data.type,
      iban: data.type === "bank_account" ? data.iban?.replace(/[\s-]/g, "").toUpperCase() : null,
    })
    .eq("id", resourceId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Esiste già una risorsa con questo codice" };
    }
    return { error: `Errore nell'aggiornamento: ${error.message}` };
  }

  revalidatePath("/settings");
  return { success: true, resource };
}

export async function deleteCollectionResourceAction(resourceId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageCollectionResources(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("collection_resources")
    .select("organization_id")
    .eq("id", resourceId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Risorsa non trovata" };
  }

  // Try physical delete first; if FK constraint fails, do soft delete
  const { error: deleteError } = await admin
    .from("collection_resources")
    .delete()
    .eq("id", resourceId);

  if (deleteError) {
    // FK constraint violation — soft delete instead
    if (deleteError.code === "23503") {
      const { error: softError } = await admin
        .from("collection_resources")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", resourceId);

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

export async function toggleCollectionResourceActiveAction(resourceId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageCollectionResources(currentUser.roles)) return { error: "Non autorizzato" };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("collection_resources")
    .select("organization_id, is_active")
    .eq("id", resourceId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Risorsa non trovata" };
  }

  const newActive = !existing.is_active;
  const { error } = await admin
    .from("collection_resources")
    .update({ is_active: newActive })
    .eq("id", resourceId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: true, is_active: newActive };
}

const DEFAULT_COLLECTION_RESOURCES: Omit<CollectionResourceInput, "iban">[] = [
  { name: "Cassa Contanti", code: "CASSA", type: "cash" },
  { name: "Conto Corrente Bancario", code: "CC01", type: "bank_account" },
  { name: "POS", code: "POS", type: "other" },
];

export async function seedCollectionResourcesAction() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageCollectionResources(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const admin = createAdminClient();

  const rows = DEFAULT_COLLECTION_RESOURCES.map((r) => ({
    organization_id: organizationId,
    name: r.name,
    code: r.code,
    type: r.type,
    created_by: currentUser.profile.id,
  }));

  const { error } = await admin.from("collection_resources").insert(rows);

  if (error) {
    console.error("Error seeding collection resources:", error.message);
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}
