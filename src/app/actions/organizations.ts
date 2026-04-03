"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { seedVatCodesForOrganization } from "@/app/actions/vat-codes";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createOrganizationAction(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.roles.includes("superadmin")) {
    return { error: "Non autorizzato" };
  }

  const name = formData.get("name") as string;

  if (!name) {
    return { error: "Il nome è obbligatorio" };
  }

  const slug = generateSlug(name);

  const admin = createAdminClient();

  // Check slug uniqueness
  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) {
    return { error: "Slug già in uso" };
  }

  // Locale settings from form
  const locale = (formData.get("locale") as string) || "it-IT";
  const currency = (formData.get("currency") as string) || "EUR";
  const date_format = (formData.get("date_format") as string) || "dd/MM/yyyy";
  const time_format = (formData.get("time_format") as string) || "HH:mm";
  const decimal_separator = (formData.get("decimal_separator") as string) || ",";
  const thousands_separator = (formData.get("thousands_separator") as string) || ".";

  // Create organization
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name,
      slug,
      locale,
      currency,
      date_format,
      time_format,
      decimal_separator,
      thousands_separator,
    })
    .select("id")
    .single();

  if (orgError || !org) {
    return { error: "Errore nella creazione dell'organizzazione" };
  }

  // Seed default Italian VAT codes
  await seedVatCodesForOrganization(org.id);

  revalidatePath("/superadmin");
  return { success: true };
}

export async function renameOrganizationAction(orgId: string, newName: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.roles.includes("superadmin")) {
    return { error: "Non autorizzato" };
  }

  if (!newName.trim()) {
    return { error: "Il nome è obbligatorio" };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("organizations")
    .update({ name: newName.trim(), slug: generateSlug(newName) })
    .eq("id", orgId);

  if (error) {
    return { error: "Errore nell'aggiornamento" };
  }

  revalidatePath("/superadmin");
  return { success: true };
}

export async function toggleOrganizationAction(
  orgId: string,
  isActive: boolean
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.roles.includes("superadmin")) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("organizations")
    .update({ is_active: isActive })
    .eq("id", orgId);

  if (error) {
    return { error: "Errore nell'aggiornamento" };
  }

  revalidatePath("/superadmin");
  return { success: true };
}

export async function updateOrganizationSettingsAction(
  orgId: string,
  settings: {
    locale: string;
    currency: string;
    date_format: string;
    time_format: string;
    decimal_separator: string;
    thousands_separator: string;
  }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.roles.includes("superadmin")) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("organizations")
    .update(settings)
    .eq("id", orgId);

  if (error) {
    return { error: "Errore nell'aggiornamento delle impostazioni" };
  }

  revalidatePath("/superadmin");
  return { success: true };
}

export async function deleteOrganizationAction(orgId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.roles.includes("superadmin")) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  // Get all users of this org to delete their auth accounts
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", orgId);

  if (profiles) {
    for (const profile of profiles) {
      await admin.auth.admin.deleteUser(profile.id);
    }
  }

  const { error } = await admin
    .from("organizations")
    .delete()
    .eq("id", orgId);

  if (error) {
    return { error: "Errore nell'eliminazione" };
  }

  revalidatePath("/superadmin");
  return { success: true };
}
