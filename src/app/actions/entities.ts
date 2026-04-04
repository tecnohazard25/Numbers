"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { EntityType } from "@/types/supabase";

function canManageEntities(roles: string[]): boolean {
  return roles.includes("accountant");
}

export interface EntityInput {
  type: EntityType;
  code: string;
  name: string;
  is_active?: boolean;
  // Workplace
  workplace_address?: string | null;
  // Room
  room_workplace_id?: string | null;
  // Activity
  activity_branch_id?: string | null;
  activity_avg_selling_price?: number | null;
  activity_duration_minutes?: number | null;
  activity_avg_cost_lab?: number | null;
  activity_avg_cost_staff?: number | null;
  activity_avg_cost_materials?: number | null;
  // Junction data (doctor + activity)
  doctor_branch_ids?: string[];
  doctor_workplace_ids?: string[];
  activity_workplace_ids?: string[];
}

export async function createEntityAction(data: EntityInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageEntities(currentUser.roles)) return { error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  if (!data.name?.trim() || !data.code?.trim() || !data.type) {
    return { error: "Nome, codice e tipo sono obbligatori" };
  }

  if (data.type === "room" && !data.room_workplace_id) {
    return { error: "La sede è obbligatoria per gli ambulatori" };
  }

  const admin = createAdminClient();

  // Build insert row with only relevant columns for the type
  const row: Record<string, unknown> = {
    organization_id: organizationId,
    type: data.type,
    code: data.code.trim(),
    name: data.name.trim(),
    is_active: data.is_active ?? true,
    created_by: currentUser.user.id,
  };

  if (data.type === "workplace") {
    row.workplace_address = data.workplace_address || null;
  }
  if (data.type === "room") {
    row.room_workplace_id = data.room_workplace_id;
  }
  if (data.type === "activity") {
    row.activity_branch_id = data.activity_branch_id || null;
    row.activity_avg_selling_price = data.activity_avg_selling_price ?? null;
    row.activity_duration_minutes = data.activity_duration_minutes ?? null;
    row.activity_avg_cost_lab = data.activity_avg_cost_lab ?? null;
    row.activity_avg_cost_staff = data.activity_avg_cost_staff ?? null;
    row.activity_avg_cost_materials = data.activity_avg_cost_materials ?? null;
  }

  const { data: entity, error } = await admin
    .from("entities")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: `Esiste già un'entità con codice "${data.code}" per questo tipo` };
    }
    console.error("Error creating entity:", error);
    return { error: "Errore nella creazione dell'entità" };
  }

  // Insert junction rows
  if (data.type === "doctor" && entity) {
    if (data.doctor_branch_ids?.length) {
      await admin.from("entity_doctor_branches").insert(
        data.doctor_branch_ids.map((branchId) => ({
          doctor_id: entity.id,
          branch_id: branchId,
        }))
      );
    }
    if (data.doctor_workplace_ids?.length) {
      await admin.from("entity_doctor_workplaces").insert(
        data.doctor_workplace_ids.map((workplaceId) => ({
          doctor_id: entity.id,
          workplace_id: workplaceId,
        }))
      );
    }
  }

  if (data.type === "activity" && entity) {
    if (data.activity_workplace_ids?.length) {
      await admin.from("entity_activity_workplaces").insert(
        data.activity_workplace_ids.map((workplaceId) => ({
          activity_id: entity.id,
          workplace_id: workplaceId,
        }))
      );
    }
  }

  revalidatePath("/settings");
  return { success: true, id: entity.id };
}

export async function updateEntityAction(entityId: string, data: EntityInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageEntities(currentUser.roles)) return { error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  if (!data.name?.trim() || !data.code?.trim()) {
    return { error: "Nome e codice sono obbligatori" };
  }

  if (data.type === "room" && !data.room_workplace_id) {
    return { error: "La sede è obbligatoria per gli ambulatori" };
  }

  const admin = createAdminClient();

  // Verify entity belongs to org
  const { data: existing } = await admin
    .from("entities")
    .select("id, organization_id, type")
    .eq("id", entityId)
    .single();

  if (!existing || existing.organization_id !== organizationId) {
    return { error: "Entità non trovata" };
  }

  const updates: Record<string, unknown> = {
    code: data.code.trim(),
    name: data.name.trim(),
    is_active: data.is_active ?? true,
  };

  if (data.type === "workplace") {
    updates.workplace_address = data.workplace_address || null;
  }
  if (data.type === "room") {
    updates.room_workplace_id = data.room_workplace_id;
  }
  if (data.type === "activity") {
    updates.activity_branch_id = data.activity_branch_id || null;
    updates.activity_avg_selling_price = data.activity_avg_selling_price ?? null;
    updates.activity_duration_minutes = data.activity_duration_minutes ?? null;
    updates.activity_avg_cost_lab = data.activity_avg_cost_lab ?? null;
    updates.activity_avg_cost_staff = data.activity_avg_cost_staff ?? null;
    updates.activity_avg_cost_materials = data.activity_avg_cost_materials ?? null;
  }

  const { error } = await admin
    .from("entities")
    .update(updates)
    .eq("id", entityId);

  if (error) {
    if (error.code === "23505") {
      return { error: `Esiste già un'entità con codice "${data.code}" per questo tipo` };
    }
    console.error("Error updating entity:", error);
    return { error: "Errore nell'aggiornamento dell'entità" };
  }

  // Sync junction rows for doctor
  if (data.type === "doctor") {
    await admin.from("entity_doctor_branches").delete().eq("doctor_id", entityId);
    await admin.from("entity_doctor_workplaces").delete().eq("doctor_id", entityId);

    if (data.doctor_branch_ids?.length) {
      await admin.from("entity_doctor_branches").insert(
        data.doctor_branch_ids.map((branchId) => ({
          doctor_id: entityId,
          branch_id: branchId,
        }))
      );
    }
    if (data.doctor_workplace_ids?.length) {
      await admin.from("entity_doctor_workplaces").insert(
        data.doctor_workplace_ids.map((workplaceId) => ({
          doctor_id: entityId,
          workplace_id: workplaceId,
        }))
      );
    }
  }

  // Sync junction rows for activity
  if (data.type === "activity") {
    await admin.from("entity_activity_workplaces").delete().eq("activity_id", entityId);

    if (data.activity_workplace_ids?.length) {
      await admin.from("entity_activity_workplaces").insert(
        data.activity_workplace_ids.map((workplaceId) => ({
          activity_id: entityId,
          workplace_id: workplaceId,
        }))
      );
    }
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function deleteEntityAction(entityId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageEntities(currentUser.roles)) return { error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const admin = createAdminClient();

  // Verify entity belongs to org
  const { data: existing } = await admin
    .from("entities")
    .select("id, organization_id")
    .eq("id", entityId)
    .single();

  if (!existing || existing.organization_id !== organizationId) {
    return { error: "Entità non trovata" };
  }

  // Try physical delete; if FK constraint, soft-delete
  const { error } = await admin
    .from("entities")
    .delete()
    .eq("id", entityId);

  if (error) {
    if (error.code === "23503") {
      // FK constraint — soft delete
      const { error: softError } = await admin
        .from("entities")
        .update({ is_active: false })
        .eq("id", entityId);

      if (softError) {
        console.error("Error soft-deleting entity:", softError);
        return { error: "Errore nella disattivazione dell'entità" };
      }
      revalidatePath("/settings");
      return { success: true, softDeleted: true };
    }
    console.error("Error deleting entity:", error);
    return { error: "Errore nell'eliminazione dell'entità" };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function toggleEntityActiveAction(entityId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageEntities(currentUser.roles)) return { error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("entities")
    .select("id, organization_id, is_active")
    .eq("id", entityId)
    .single();

  if (!existing || existing.organization_id !== organizationId) {
    return { error: "Entità non trovata" };
  }

  const { error } = await admin
    .from("entities")
    .update({ is_active: !existing.is_active })
    .eq("id", entityId);

  if (error) {
    console.error("Error toggling entity:", error);
    return { error: "Errore nel cambio stato dell'entità" };
  }

  revalidatePath("/settings");
  return { success: true, is_active: !existing.is_active };
}
