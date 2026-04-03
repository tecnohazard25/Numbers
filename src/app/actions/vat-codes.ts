"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const ITALIAN_VAT_CODES = [
  { code: "22", description: "IVA 22% - Aliquota ordinaria", rate: 22, nature: null },
  { code: "10", description: "IVA 10% - Aliquota ridotta", rate: 10, nature: null },
  { code: "5", description: "IVA 5% - Aliquota ridotta", rate: 5, nature: null },
  { code: "4", description: "IVA 4% - Aliquota minima", rate: 4, nature: null },
  { code: "N1", description: "Escluse ex art. 15 del DPR 633/72", rate: 0, nature: "N1" },
  { code: "N2.1", description: "Non soggette - artt. da 7 a 7-septies del DPR 633/72", rate: 0, nature: "N2.1" },
  { code: "N2.2", description: "Non soggette - altri casi", rate: 0, nature: "N2.2" },
  { code: "N3.1", description: "Non imponibili - esportazioni", rate: 0, nature: "N3.1" },
  { code: "N3.2", description: "Non imponibili - cessioni intracomunitarie", rate: 0, nature: "N3.2" },
  { code: "N3.3", description: "Non imponibili - cessioni verso San Marino", rate: 0, nature: "N3.3" },
  { code: "N3.4", description: "Non imponibili - operazioni assimilate alle cessioni all'esportazione", rate: 0, nature: "N3.4" },
  { code: "N3.5", description: "Non imponibili - a seguito di dichiarazioni d'intento", rate: 0, nature: "N3.5" },
  { code: "N3.6", description: "Non imponibili - altre operazioni che non concorrono alla formazione del plafond", rate: 0, nature: "N3.6" },
  { code: "N4", description: "Esenti", rate: 0, nature: "N4" },
  { code: "N5", description: "Regime del margine / IVA non esposta in fattura", rate: 0, nature: "N5" },
  { code: "N6.1", description: "Inversione contabile - cessione di rottami e altri materiali di recupero", rate: 0, nature: "N6.1" },
  { code: "N6.2", description: "Inversione contabile - cessione di oro e argento ai sensi della legge 7/2000", rate: 0, nature: "N6.2" },
  { code: "N6.3", description: "Inversione contabile - subappalto nel settore edile", rate: 0, nature: "N6.3" },
  { code: "N6.4", description: "Inversione contabile - cessione di fabbricati", rate: 0, nature: "N6.4" },
  { code: "N6.5", description: "Inversione contabile - cessione di telefoni cellulari", rate: 0, nature: "N6.5" },
  { code: "N6.6", description: "Inversione contabile - cessione di prodotti elettronici", rate: 0, nature: "N6.6" },
  { code: "N6.7", description: "Inversione contabile - prestazioni comparto edile e settori connessi", rate: 0, nature: "N6.7" },
  { code: "N6.8", description: "Inversione contabile - operazioni settore energetico", rate: 0, nature: "N6.8" },
  { code: "N6.9", description: "Inversione contabile - altri casi", rate: 0, nature: "N6.9" },
  { code: "N7", description: "IVA assolta in altro stato UE", rate: 0, nature: "N7" },
];


function canManageVatCodes(roles: string[]): boolean {
  return roles.includes("accountant");
}

export async function createVatCodeAction(
  code: string,
  description: string,
  rate: number,
  nature: string | null
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageVatCodes(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  if (!code.trim()) return { error: "Codice obbligatorio" };
  if (!description.trim()) return { error: "Descrizione obbligatoria" };

  const admin = createAdminClient();

  const { data: vatCode, error } = await admin
    .from("vat_codes")
    .insert({
      organization_id: organizationId,
      code: code.trim(),
      description: description.trim(),
      rate,
      nature: nature?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Codice IVA già esistente" };
    }
    return { error: `Errore nella creazione: ${error.message}` };
  }

  revalidatePath("/settings");
  return { success: true, vatCode };
}

export async function updateVatCodeAction(
  vatCodeId: string,
  code: string,
  description: string,
  rate: number,
  nature: string | null,
  isActive: boolean
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageVatCodes(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  if (!code.trim()) return { error: "Codice obbligatorio" };
  if (!description.trim()) return { error: "Descrizione obbligatoria" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("vat_codes")
    .select("organization_id")
    .eq("id", vatCodeId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Codice IVA non trovato" };
  }

  const { data: vatCode, error } = await admin
    .from("vat_codes")
    .update({
      code: code.trim(),
      description: description.trim(),
      rate,
      nature: nature?.trim() || null,
      is_active: isActive,
    })
    .eq("id", vatCodeId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Un codice IVA con questo codice esiste già" };
    }
    return { error: `Errore nell'aggiornamento: ${error.message}` };
  }

  revalidatePath("/settings");
  return { success: true, vatCode };
}

export async function deleteVatCodeAction(vatCodeId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageVatCodes(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("vat_codes")
    .select("organization_id")
    .eq("id", vatCodeId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Codice IVA non trovato" };
  }

  const { error } = await admin.from("vat_codes").delete().eq("id", vatCodeId);

  if (error) {
    return { error: "Errore nell'eliminazione" };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function seedVatCodesForCurrentOrg() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  if (!canManageVatCodes(currentUser.roles)) {
    return { error: "Non autorizzato" };
  }

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const result = await seedVatCodesForOrganization(organizationId);
  if (result.error) return { error: result.error };

  revalidatePath("/settings");
  return { success: true };
}

export async function seedVatCodesForOrganization(organizationId: string) {
  const admin = createAdminClient();

  const rows = ITALIAN_VAT_CODES.map((vc) => ({
    organization_id: organizationId,
    code: vc.code,
    description: vc.description,
    rate: vc.rate,
    nature: vc.nature,
  }));

  const { error } = await admin.from("vat_codes").insert(rows);

  if (error) {
    console.error("Error seeding VAT codes:", error.message);
    return { error: error.message };
  }

  return { success: true };
}
