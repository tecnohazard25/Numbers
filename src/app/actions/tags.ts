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
  return { success: true, tag };
}

export async function deleteTagAction(tagId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const { roles } = currentUser;
  const isOrgAdmin = roles.includes("org_admin");
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
  return { success: true };
}
