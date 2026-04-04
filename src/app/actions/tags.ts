"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function createTagAction(name: string, color: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  if (!name.trim()) return { error: "Nome tag obbligatorio" };

  const admin = createAdminClient();

  const { data: tag, error } = await admin
    .from("tags")
    .insert({
      organization_id: organizationId,
      name: name.trim(),
      color: color || "#6366f1",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Tag già esistente" };
    }
    return { error: `Errore nella creazione: ${error.message}` };
  }

  revalidatePath("/subjects");
  revalidatePath("/settings");
  return { success: true, tag };
}

export async function updateTagAction(tagId: string, name: string, color: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const { roles } = currentUser;
  const isOrgAdmin = roles.includes("user_manager");
  const isSuperadmin = roles.includes("superadmin");

  if (!isSuperadmin && !isOrgAdmin) {
    return { error: "Non autorizzato" };
  }

  if (!name.trim()) return { error: "Nome tag obbligatorio" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("tags")
    .select("organization_id")
    .eq("id", tagId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Tag non trovato" };
  }

  const { data: tag, error } = await admin
    .from("tags")
    .update({ name: name.trim(), color: color || "#6366f1" })
    .eq("id", tagId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Un tag con questo nome esiste già" };
    }
    return { error: `Errore nell'aggiornamento: ${error.message}` };
  }

  revalidatePath("/subjects");
  revalidatePath("/settings");
  return { success: true, tag };
}

export async function deleteTagAction(tagId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const { roles } = currentUser;
  const isOrgAdmin = roles.includes("user_manager");
  const isSuperadmin = roles.includes("superadmin");

  if (!isSuperadmin && !isOrgAdmin) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("tags")
    .select("organization_id")
    .eq("id", tagId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Tag non trovato" };
  }

  const { error } = await admin.from("tags").delete().eq("id", tagId);

  if (error) {
    return { error: "Errore nell'eliminazione" };
  }

  revalidatePath("/subjects");
  revalidatePath("/settings");
  return { success: true };
}

export async function toggleTagActiveAction(tagId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const { roles } = currentUser;
  if (!roles.includes("superadmin") && !roles.includes("user_manager")) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("tags")
    .select("organization_id, is_active")
    .eq("id", tagId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Tag non trovato" };
  }

  const newActive = !existing.is_active;
  const { error } = await admin
    .from("tags")
    .update({ is_active: newActive })
    .eq("id", tagId);

  if (error) return { error: error.message };

  revalidatePath("/subjects");
  revalidatePath("/settings");
  return { success: true, is_active: newActive };
}
