"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { SubjectType, ContactType } from "@/types/supabase";

export interface SubjectAddressInput {
  label: string;
  is_primary: boolean;
  country_code: string;
  street: string;
  zip_code: string;
  city: string;
  province: string;
  region: string;
}

export interface SubjectContactInput {
  type: ContactType;
  label: string;
  value: string;
  is_primary: boolean;
}

export interface SubjectInput {
  type: SubjectType;
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  birth_place?: string;
  gender?: string;
  business_name?: string;
  tax_code?: string;
  vat_number?: string;
  sdi_code?: string;
  iban?: string;
  notes?: string;
  addresses: SubjectAddressInput[];
  contacts: SubjectContactInput[];
  tag_ids: string[];
  new_tags: { name: string; color: string }[];
}

export async function createSubjectAction(data: SubjectInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const { roles, profile } = currentUser;
  const isOrgAdmin = roles.includes("org_admin");
  const isSuperadmin = roles.includes("superadmin");

  if (!isSuperadmin && !isOrgAdmin) {
    return { error: "Non autorizzato" };
  }

  const organizationId = profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  if (data.type === "person") {
    if (!data.first_name || !data.last_name) {
      return { error: "Nome e cognome sono obbligatori per le persone fisiche" };
    }
  } else {
    if (!data.business_name) {
      return { error: "Ragione sociale obbligatoria" };
    }
  }

  const admin = createAdminClient();

  const { data: subject, error: subjectError } = await admin
    .from("subjects")
    .insert({
      organization_id: organizationId,
      type: data.type,
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      birth_date: data.birth_date || null,
      birth_place: data.birth_place || null,
      gender: data.gender || null,
      business_name: data.business_name || null,
      tax_code: data.tax_code || null,
      vat_number: data.vat_number || null,
      sdi_code: data.sdi_code || null,
      iban: data.iban || null,
      notes: data.notes || null,
      created_by: currentUser.user.id,
    })
    .select("id")
    .single();

  if (subjectError || !subject) {
    return { error: `Errore nella creazione: ${subjectError?.message}` };
  }

  if (data.addresses.length > 0) {
    const { error: addrError } = await admin.from("subject_addresses").insert(
      data.addresses.map((a) => ({
        subject_id: subject.id,
        label: a.label || null,
        is_primary: a.is_primary,
        country_code: a.country_code || "IT",
        street: a.street || null,
        zip_code: a.zip_code || null,
        city: a.city || null,
        province: a.province || null,
        region: a.region || null,
      }))
    );
    if (addrError) {
      return { error: `Errore nel salvataggio indirizzi: ${addrError.message}` };
    }
  }

  if (data.contacts.length > 0) {
    const { error: contactError } = await admin.from("subject_contacts").insert(
      data.contacts.map((c) => ({
        subject_id: subject.id,
        type: c.type,
        label: c.label || null,
        value: c.value,
        is_primary: c.is_primary,
      }))
    );
    if (contactError) {
      return { error: `Errore nel salvataggio contatti: ${contactError.message}` };
    }
  }

  const allTagIds = [...data.tag_ids];

  for (const newTag of data.new_tags) {
    const { data: created, error: tagError } = await admin
      .from("tags")
      .insert({
        organization_id: organizationId,
        name: newTag.name,
        color: newTag.color,
      })
      .select("id")
      .single();

    if (tagError) {
      const { data: existing } = await admin
        .from("tags")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("name", newTag.name)
        .single();
      if (existing) allTagIds.push(existing.id);
    } else if (created) {
      allTagIds.push(created.id);
    }
  }

  if (allTagIds.length > 0) {
    await admin.from("subject_tags").insert(
      allTagIds.map((tagId) => ({
        subject_id: subject.id,
        tag_id: tagId,
      }))
    );
  }

  revalidatePath("/subjects");
  return { success: true, id: subject.id };
}

export async function updateSubjectAction(subjectId: string, data: SubjectInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const { roles, profile } = currentUser;
  const isOrgAdmin = roles.includes("org_admin");
  const isSuperadmin = roles.includes("superadmin");

  if (!isSuperadmin && !isOrgAdmin) {
    return { error: "Non autorizzato" };
  }

  const organizationId = profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("subjects")
    .select("organization_id")
    .eq("id", subjectId)
    .single();

  if (!existing || existing.organization_id !== organizationId) {
    return { error: "Soggetto non trovato" };
  }

  if (data.type === "person") {
    if (!data.first_name || !data.last_name) {
      return { error: "Nome e cognome sono obbligatori per le persone fisiche" };
    }
  } else {
    if (!data.business_name) {
      return { error: "Ragione sociale obbligatoria" };
    }
  }

  const { error: updateError } = await admin
    .from("subjects")
    .update({
      type: data.type,
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      birth_date: data.birth_date || null,
      birth_place: data.birth_place || null,
      gender: data.gender || null,
      business_name: data.business_name || null,
      tax_code: data.tax_code || null,
      vat_number: data.vat_number || null,
      sdi_code: data.sdi_code || null,
      iban: data.iban || null,
      notes: data.notes || null,
    })
    .eq("id", subjectId);

  if (updateError) {
    return { error: `Errore nell'aggiornamento: ${updateError.message}` };
  }

  await admin.from("subject_addresses").delete().eq("subject_id", subjectId);
  if (data.addresses.length > 0) {
    await admin.from("subject_addresses").insert(
      data.addresses.map((a) => ({
        subject_id: subjectId,
        label: a.label || null,
        is_primary: a.is_primary,
        country_code: a.country_code || "IT",
        street: a.street || null,
        zip_code: a.zip_code || null,
        city: a.city || null,
        province: a.province || null,
        region: a.region || null,
      }))
    );
  }

  await admin.from("subject_contacts").delete().eq("subject_id", subjectId);
  if (data.contacts.length > 0) {
    await admin.from("subject_contacts").insert(
      data.contacts.map((c) => ({
        subject_id: subjectId,
        type: c.type,
        label: c.label || null,
        value: c.value,
        is_primary: c.is_primary,
      }))
    );
  }

  await admin.from("subject_tags").delete().eq("subject_id", subjectId);
  const allTagIds = [...data.tag_ids];

  for (const newTag of data.new_tags) {
    const { data: created, error: tagError } = await admin
      .from("tags")
      .insert({
        organization_id: organizationId,
        name: newTag.name,
        color: newTag.color,
      })
      .select("id")
      .single();

    if (tagError) {
      const { data: existingTag } = await admin
        .from("tags")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("name", newTag.name)
        .single();
      if (existingTag) allTagIds.push(existingTag.id);
    } else if (created) {
      allTagIds.push(created.id);
    }
  }

  if (allTagIds.length > 0) {
    await admin.from("subject_tags").insert(
      allTagIds.map((tagId) => ({
        subject_id: subjectId,
        tag_id: tagId,
      }))
    );
  }

  revalidatePath("/subjects");
  return { success: true };
}

export async function deleteSubjectAction(subjectId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const { roles, profile } = currentUser;
  const isOrgAdmin = roles.includes("org_admin");
  const isSuperadmin = roles.includes("superadmin");

  if (!isSuperadmin && !isOrgAdmin) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("subjects")
    .select("organization_id")
    .eq("id", subjectId)
    .single();

  if (!existing || existing.organization_id !== profile.organization_id) {
    return { error: "Soggetto non trovato" };
  }

  const { error } = await admin.from("subjects").delete().eq("id", subjectId);

  if (error) {
    return { error: "Errore nell'eliminazione" };
  }

  revalidatePath("/subjects");
  return { success: true };
}

export async function toggleSubjectAction(subjectId: string, isActive: boolean) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const { roles, profile } = currentUser;
  const isOrgAdmin = roles.includes("org_admin");
  const isSuperadmin = roles.includes("superadmin");

  if (!isSuperadmin && !isOrgAdmin) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("subjects")
    .select("organization_id")
    .eq("id", subjectId)
    .single();

  if (!existing || existing.organization_id !== profile.organization_id) {
    return { error: "Soggetto non trovato" };
  }

  const { error } = await admin
    .from("subjects")
    .update({ is_active: isActive })
    .eq("id", subjectId);

  if (error) {
    return { error: "Errore nell'aggiornamento" };
  }

  revalidatePath("/subjects");
  return { success: true };
}
