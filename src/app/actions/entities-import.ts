"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx-js-style";
import type { EntityType } from "@/types/supabase";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function canManageEntities(roles: string[]): boolean {
  return roles.includes("accountant");
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse-new")).default;
  const data = await pdfParse(buffer);
  return data.text;
}

function getEntityImportPrompt(type: EntityType): string {
  switch (type) {
    case "branch":
      return `Estrai tutte le branche specialistiche dal documento.
Per ogni branca restituisci: code, name, is_active (default true se non specificato).
Rispondi SOLO con JSON: { "entities": [{ "code": "...", "name": "...", "is_active": true }] }`;

    case "workplace":
      return `Estrai tutte le sedi dal documento.
Per ogni sede restituisci: code, name, address, is_active.
Rispondi SOLO con JSON: { "entities": [{ "code": "...", "name": "...", "address": "...", "is_active": true }] }`;

    case "room":
      return `Estrai tutti gli ambulatori dal documento.
Per ogni ambulatorio restituisci: code, name, workplace_code (codice della sede di appartenenza), is_active.
Rispondi SOLO con JSON: { "entities": [{ "code": "...", "name": "...", "workplace_code": "...", "is_active": true }] }`;

    case "doctor":
      return `Estrai tutti i medici dal documento.
Per ogni medico restituisci: code, name, branch_codes (array di codici branca), workplace_codes (array di codici sede), is_active.
Rispondi SOLO con JSON: { "entities": [{ "code": "...", "name": "...", "branch_codes": [], "workplace_codes": [], "is_active": true }] }`;

    case "activity":
      return `Estrai tutte le prestazioni/attività dal documento.
Per ogni prestazione restituisci: code, name, branch_code, avg_selling_price, duration_minutes,
avg_cost_lab, avg_cost_staff, avg_cost_materials, workplace_codes, is_active.
Se un campo numerico non è presente nel documento, restituisci null.
Rispondi SOLO con JSON: { "entities": [{ "code": "...", "name": "...", "branch_code": null, "avg_selling_price": null, "duration_minutes": null, "avg_cost_lab": null, "avg_cost_staff": null, "avg_cost_materials": null, "workplace_codes": [], "is_active": true }] }`;
  }
}

export interface ParsedEntity {
  code: string;
  name: string;
  is_active: boolean;
  status: "new" | "existing";
  existing_id?: string;
  // Workplace
  address?: string | null;
  // Room
  workplace_code?: string | null;
  resolved_workplace_id?: string | null;
  // Doctor
  branch_codes?: string[];
  workplace_codes?: string[];
  resolved_branch_ids?: string[];
  resolved_workplace_ids?: string[];
  // Activity
  branch_code?: string | null;
  resolved_branch_id?: string | null;
  avg_selling_price?: number | null;
  duration_minutes?: number | null;
  avg_cost_lab?: number | null;
  avg_cost_staff?: number | null;
  avg_cost_materials?: number | null;
  resolved_activity_workplace_ids?: string[];
  // Warnings
  warnings?: string[];
}

export interface ImportPreview {
  entities: ParsedEntity[];
  totalNew: number;
  totalExisting: number;
  totalSkipped: number;
  unresolvedFks: string[];
}

export interface ImportReport {
  inserted: number;
  updated: number;
  skipped: number;
  unresolvedFks: string[];
}

async function callGeminiForEntities(textContent: string, type: EntityType): Promise<{ success: true; data: { entities: Record<string, unknown>[] } } | { success: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "GEMINI_API_KEY non configurata" };
  }

  const prompt = getEntityImportPrompt(type);

  const requestBody = JSON.stringify({
    contents: [{
      parts: [
        { text: `Contenuto del documento:\n\n${textContent}` },
        { text: prompt },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  try {
    let response: Response | null = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      if (response.status === 429 && attempt < 2) {
        const waitMs = (attempt + 1) * 3000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      const errorBody = response ? await response.text() : "No response";
      return { success: false, error: `Errore API Gemini: ${response?.status} — ${errorBody.slice(0, 200)}` };
    }

    const result = await response.json();
    const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      return { success: false, error: "Risposta Gemini vuota" };
    }

    const jsonStr = textResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed.entities)) {
      return { success: false, error: "Formato risposta non valido" };
    }

    return { success: true, data: parsed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Errore Gemini: ${msg}` };
  }
}

/**
 * Step 1: Process uploaded file and return preview
 */
export async function processEntitiesImportAction(formData: FormData): Promise<
  { success: true; preview: ImportPreview } | { success: false; error: string }
> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { success: false, error: "Non autorizzato" };
  if (!canManageEntities(currentUser.roles)) return { success: false, error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { success: false, error: "Organizzazione non trovata" };

  const file = formData.get("file") as File;
  const entityType = formData.get("entityType") as EntityType;

  if (!file || !entityType) {
    return { success: false, error: "File e tipo entità obbligatori" };
  }

  // Extract text from file
  let textContent: string;
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    textContent = await extractPdfText(buffer);
  } else if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    textContent = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
  } else {
    return { success: false, error: "Formato file non supportato" };
  }

  if (!textContent.trim()) {
    return { success: false, error: "Il file è vuoto o non leggibile" };
  }

  // Call Gemini
  const geminiResult = await callGeminiForEntities(textContent, entityType);
  if (!geminiResult.success) {
    return { success: false, error: geminiResult.error };
  }

  const rawEntities = geminiResult.data.entities;
  const admin = createAdminClient();

  // Load existing entities for dedup
  const { data: existingEntities } = await admin
    .from("entities")
    .select("id, code, type")
    .eq("organization_id", organizationId)
    .eq("type", entityType);

  const existingMap = new Map((existingEntities ?? []).map((e) => [e.code, e.id]));

  // Load branches and workplaces for FK resolution
  const { data: allBranches } = await admin
    .from("entities")
    .select("id, code")
    .eq("organization_id", organizationId)
    .eq("type", "branch");
  const branchCodeMap = new Map((allBranches ?? []).map((b) => [b.code, b.id]));

  const { data: allWorkplaces } = await admin
    .from("entities")
    .select("id, code")
    .eq("organization_id", organizationId)
    .eq("type", "workplace");
  const workplaceCodeMap = new Map((allWorkplaces ?? []).map((w) => [w.code, w.id]));

  const unresolvedFks: string[] = [];
  const parsedEntities: ParsedEntity[] = [];

  for (const raw of rawEntities) {
    const code = String(raw.code ?? "").trim();
    const name = String(raw.name ?? "").trim();
    if (!code || !name) continue;

    const existingId = existingMap.get(code);
    const entity: ParsedEntity = {
      code,
      name,
      is_active: raw.is_active !== false,
      status: existingId ? "existing" : "new",
      existing_id: existingId,
      warnings: [],
    };

    // Type-specific field mapping and FK resolution
    if (entityType === "workplace") {
      entity.address = raw.address ? String(raw.address) : null;
    }

    if (entityType === "room") {
      const wpCode = raw.workplace_code ? String(raw.workplace_code) : null;
      entity.workplace_code = wpCode;
      if (wpCode) {
        const wpId = workplaceCodeMap.get(wpCode);
        if (wpId) {
          entity.resolved_workplace_id = wpId;
        } else {
          unresolvedFks.push(`Room "${code}": workplace_code "${wpCode}" non trovato`);
        }
      }
    }

    if (entityType === "doctor") {
      const branchCodes = Array.isArray(raw.branch_codes) ? raw.branch_codes.map(String) : [];
      const workplaceCodes = Array.isArray(raw.workplace_codes) ? raw.workplace_codes.map(String) : [];
      entity.branch_codes = branchCodes;
      entity.workplace_codes = workplaceCodes;
      entity.resolved_branch_ids = [];
      entity.resolved_workplace_ids = [];

      for (const bc of branchCodes) {
        const bid = branchCodeMap.get(bc);
        if (bid) entity.resolved_branch_ids.push(bid);
        else unresolvedFks.push(`Doctor "${code}": branch_code "${bc}" non trovato`);
      }
      for (const wc of workplaceCodes) {
        const wid = workplaceCodeMap.get(wc);
        if (wid) entity.resolved_workplace_ids.push(wid);
        else unresolvedFks.push(`Doctor "${code}": workplace_code "${wc}" non trovato`);
      }
    }

    if (entityType === "activity") {
      const branchCode = raw.branch_code ? String(raw.branch_code) : null;
      entity.branch_code = branchCode;
      entity.avg_selling_price = raw.avg_selling_price != null ? Number(raw.avg_selling_price) : null;
      entity.duration_minutes = raw.duration_minutes != null ? Number(raw.duration_minutes) : null;
      entity.avg_cost_lab = raw.avg_cost_lab != null ? Number(raw.avg_cost_lab) : null;
      entity.avg_cost_staff = raw.avg_cost_staff != null ? Number(raw.avg_cost_staff) : null;
      entity.avg_cost_materials = raw.avg_cost_materials != null ? Number(raw.avg_cost_materials) : null;

      if (branchCode) {
        const bid = branchCodeMap.get(branchCode);
        if (bid) entity.resolved_branch_id = bid;
        else unresolvedFks.push(`Activity "${code}": branch_code "${branchCode}" non trovato`);
      }

      const workplaceCodes = Array.isArray(raw.workplace_codes) ? raw.workplace_codes.map(String) : [];
      entity.resolved_activity_workplace_ids = [];
      for (const wc of workplaceCodes) {
        const wid = workplaceCodeMap.get(wc);
        if (wid) entity.resolved_activity_workplace_ids.push(wid);
        else unresolvedFks.push(`Activity "${code}": workplace_code "${wc}" non trovato`);
      }
    }

    parsedEntities.push(entity);
  }

  return {
    success: true,
    preview: {
      entities: parsedEntities,
      totalNew: parsedEntities.filter((e) => e.status === "new").length,
      totalExisting: parsedEntities.filter((e) => e.status === "existing").length,
      totalSkipped: rawEntities.length - parsedEntities.length,
      unresolvedFks,
    },
  };
}

/**
 * Step 2: Confirm and save imported entities
 */
export async function confirmEntitiesImportAction(data: {
  entities: ParsedEntity[];
  entityType: EntityType;
}): Promise<{ success: true; report: ImportReport } | { success: false; error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { success: false, error: "Non autorizzato" };
  if (!canManageEntities(currentUser.roles)) return { success: false, error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { success: false, error: "Organizzazione non trovata" };

  const admin = createAdminClient();
  let inserted = 0;
  let updated = 0;
  const unresolvedFks: string[] = [];

  for (const entity of data.entities) {
    const row: Record<string, unknown> = {
      organization_id: organizationId,
      type: data.entityType,
      code: entity.code,
      name: entity.name,
      is_active: entity.is_active,
      created_by: currentUser.user.id,
    };

    if (data.entityType === "workplace") {
      row.workplace_address = entity.address || null;
    }
    if (data.entityType === "room") {
      row.room_workplace_id = entity.resolved_workplace_id || null;
    }
    if (data.entityType === "activity") {
      row.activity_branch_id = entity.resolved_branch_id || null;
      row.activity_avg_selling_price = entity.avg_selling_price ?? null;
      row.activity_duration_minutes = entity.duration_minutes ?? null;
      row.activity_avg_cost_lab = entity.avg_cost_lab ?? null;
      row.activity_avg_cost_staff = entity.avg_cost_staff ?? null;
      row.activity_avg_cost_materials = entity.avg_cost_materials ?? null;
    }

    if (entity.status === "new") {
      const { data: newEntity, error } = await admin
        .from("entities")
        .insert(row)
        .select("id")
        .single();

      if (error) {
        console.error(`Error inserting entity ${entity.code}:`, error);
        continue;
      }
      inserted++;

      // Junction rows for doctor
      if (data.entityType === "doctor" && newEntity) {
        if (entity.resolved_branch_ids?.length) {
          await admin.from("entity_doctor_branches").insert(
            entity.resolved_branch_ids.map((bid) => ({ doctor_id: newEntity.id, branch_id: bid }))
          );
        }
        if (entity.resolved_workplace_ids?.length) {
          await admin.from("entity_doctor_workplaces").insert(
            entity.resolved_workplace_ids.map((wid) => ({ doctor_id: newEntity.id, workplace_id: wid }))
          );
        }
      }

      // Junction rows for activity
      if (data.entityType === "activity" && newEntity) {
        if (entity.resolved_activity_workplace_ids?.length) {
          await admin.from("entity_activity_workplaces").insert(
            entity.resolved_activity_workplace_ids.map((wid) => ({ activity_id: newEntity.id, workplace_id: wid }))
          );
        }
      }
    } else if (entity.status === "existing" && entity.existing_id) {
      // Update existing
      const { created_by, organization_id, type, ...updateFields } = row;
      const { error } = await admin
        .from("entities")
        .update(updateFields)
        .eq("id", entity.existing_id);

      if (error) {
        console.error(`Error updating entity ${entity.code}:`, error);
        continue;
      }
      updated++;

      // Sync junctions for doctor
      if (data.entityType === "doctor") {
        await admin.from("entity_doctor_branches").delete().eq("doctor_id", entity.existing_id);
        await admin.from("entity_doctor_workplaces").delete().eq("doctor_id", entity.existing_id);
        if (entity.resolved_branch_ids?.length) {
          await admin.from("entity_doctor_branches").insert(
            entity.resolved_branch_ids.map((bid) => ({ doctor_id: entity.existing_id!, branch_id: bid }))
          );
        }
        if (entity.resolved_workplace_ids?.length) {
          await admin.from("entity_doctor_workplaces").insert(
            entity.resolved_workplace_ids.map((wid) => ({ doctor_id: entity.existing_id!, workplace_id: wid }))
          );
        }
      }

      // Sync junctions for activity
      if (data.entityType === "activity") {
        await admin.from("entity_activity_workplaces").delete().eq("activity_id", entity.existing_id);
        if (entity.resolved_activity_workplace_ids?.length) {
          await admin.from("entity_activity_workplaces").insert(
            entity.resolved_activity_workplace_ids.map((wid) => ({ activity_id: entity.existing_id!, workplace_id: wid }))
          );
        }
      }
    }
  }

  revalidatePath("/settings");

  return {
    success: true,
    report: {
      inserted,
      updated,
      skipped: data.entities.length - inserted - updated,
      unresolvedFks,
    },
  };
}
