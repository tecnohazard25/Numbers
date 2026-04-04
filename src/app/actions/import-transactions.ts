"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { callGeminiWithText } from "./gemini";
import * as XLSX from "xlsx-js-style";
import type {
  ImportPreviewResult,
  ImportPreviewMovement,
  TransactionDirection,
} from "@/types/supabase";

function canManageTransactions(roles: string[]): boolean {
  return roles.includes("accountant");
}

/** Extract text from PDF */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse-new")).default;
  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * Step 1: Process the uploaded file with Gemini and return a preview
 */
export async function processImportAction(formData: FormData): Promise<
  { success: true; preview: ImportPreviewResult } | { success: false; error: string }
> {
  const t0 = Date.now();

  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato", success: false };
  if (!canManageTransactions(currentUser.roles)) return { error: "Non autorizzato", success: false };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata", success: false };

  const file = formData.get("file") as File;
  const collectionResourceId = formData.get("collectionResourceId") as string;

  if (!file || !collectionResourceId) {
    return { error: "File e risorsa di incasso obbligatori", success: false };
  }

  const admin = createAdminClient();

  // Verify collection resource belongs to org
  const { data: resource } = await admin
    .from("collection_resources")
    .select("organization_id")
    .eq("id", collectionResourceId)
    .single();

  if (!resource || resource.organization_id !== organizationId) {
    return { error: "Risorsa di incasso non trovata", success: false };
  }

  // Find the active base template for this org
  const { data: activeTemplate } = await admin
    .from("reclassification_templates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("is_base", true)
    .limit(1)
    .maybeSingle();

  if (!activeTemplate) {
    return { error: "Nessun template di riclassificazione attivo trovato. Configura un template base prima di importare.", success: false };
  }

  // Get leaf nodes (parallel with file processing)
  const leafNodesPromise = admin
    .from("reclassification_nodes")
    .select("id, full_code, name, sign, parent_id")
    .eq("template_id", activeTemplate.id);

  // Extract text from file
  console.log(`[Import] Reading file ${file.name} (${(file.size / 1024).toFixed(0)} KB)...`);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let textContent: string;
  const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
  const isPdf = file.name.toLowerCase().endsWith(".pdf");

  if (isExcel) {
    const workbook = XLSX.read(buffer);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    textContent = XLSX.utils.sheet_to_csv(firstSheet);
  } else if (isPdf) {
    textContent = await extractPdfText(buffer);
    if (textContent.trim().length < 200) {
      return { error: "Il PDF sembra essere un'immagine scansionata. Utilizzare un PDF con testo selezionabile.", success: false };
    }
  } else {
    return { error: "Formato file non supportato", success: false };
  }

  console.log(`[Import] Text extracted: ${textContent.length} chars in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Wait for leaf nodes
  const { data: allNodes } = await leafNodesPromise;
  let leafNodes: { full_code: string; name: string; sign: string; id: string }[] = [];
  if (allNodes && allNodes.length > 0) {
    const parentIds = new Set(
      allNodes.filter((n) => n.parent_id).map((n) => n.parent_id)
    );
    leafNodes = allNodes
      .filter((n) => !parentIds.has(n.id))
      .map((n) => ({ full_code: n.full_code, name: n.name, sign: n.sign, id: n.id }));
  }

  console.log(`[Import] Sending ${leafNodes.length} leaf nodes to Gemini`);

  // Call Gemini — text directly, no base64
  const geminiResult = await callGeminiWithText(
    textContent,
    leafNodes.map((n) => ({ full_code: n.full_code, name: n.name, sign: n.sign as "positive" | "negative" }))
  );

  if (!geminiResult.success) {
    return { error: geminiResult.error, success: false };
  }

  const geminiData = geminiResult.data;
  console.log(`[Import] Gemini returned ${geminiData.movements.length} movements in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Dedup against DB
  const dates = geminiData.movements.map((m) => m.transaction_date).sort();
  const periodFrom = dates[0];
  const periodTo = dates[dates.length - 1];

  let existingQuery = admin
    .from("transactions")
    .select("id, transaction_date, amount, direction, description, reference")
    .eq("organization_id", organizationId)
    .eq("collection_resource_id", collectionResourceId)
    .eq("is_balance_row", false);

  if (periodFrom) existingQuery = existingQuery.gte("transaction_date", periodFrom);
  if (periodTo) existingQuery = existingQuery.lte("transaction_date", periodTo);

  const { data: existingTxs } = await existingQuery;
  const existing = existingTxs ?? [];

  const existingMap = new Map<string, typeof existing[0]>();
  for (const tx of existing) {
    const key = `${tx.transaction_date}|${Number(tx.amount).toFixed(2)}|${tx.direction}`;
    existingMap.set(key, tx);
  }

  const nodeMap = new Map<string, string>();
  for (const n of leafNodes) nodeMap.set(n.full_code, n.id);

  const previewMovements: ImportPreviewMovement[] = [];
  const matchedExistingIds = new Set<string>();

  for (const m of geminiData.movements) {
    const key = `${m.transaction_date}|${m.amount.toFixed(2)}|${m.direction}`;
    const existingTx = existingMap.get(key);
    const resolvedNodeId = m.suggested_node_full_code
      ? nodeMap.get(m.suggested_node_full_code) ?? null
      : null;

    if (existingTx) {
      matchedExistingIds.add(existingTx.id);
      previewMovements.push({ ...m, status: "updated", existing_id: existingTx.id, resolved_node_id: resolvedNodeId });
    } else {
      previewMovements.push({ ...m, status: "new", resolved_node_id: resolvedNodeId });
    }
  }

  const notFoundInFile = existing
    .filter((tx) => !matchedExistingIds.has(tx.id))
    .map((tx) => ({
      id: tx.id,
      transaction_date: tx.transaction_date,
      amount: Number(tx.amount),
      direction: tx.direction as TransactionDirection,
      description: tx.description,
    }));

  let calcIn = 0, calcOut = 0;
  for (const m of geminiData.movements) {
    if (m.direction === "in") calcIn += m.amount;
    else calcOut += m.amount;
  }

  const docTotals = geminiData.document_totals
    ? { totalIn: geminiData.document_totals.total_in, totalOut: geminiData.document_totals.total_out }
    : null;

  const totalsMatch = docTotals
    ? Math.abs(docTotals.totalIn - calcIn) < 0.01 && Math.abs(docTotals.totalOut - calcOut) < 0.01
    : true;

  console.log(`[Import] Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s — ${previewMovements.filter((m) => m.status === "new").length} new, ${previewMovements.filter((m) => m.status === "updated").length} updated`);

  return {
    success: true,
    preview: {
      movements: previewMovements,
      notFoundInFile,
      bankStatement: geminiData.bank_statement,
      documentTotals: docTotals,
      calculatedTotals: { totalIn: calcIn, totalOut: calcOut },
      totalsMatch,
    },
  };
}

/**
 * Step 2: Confirm import — bulk write movements to DB
 */
export async function confirmImportAction(
  collectionResourceId: string,
  movements: ImportPreviewMovement[]
): Promise<{ success: true; inserted: number; updated: number } | { success: false; error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato", success: false };
  if (!canManageTransactions(currentUser.roles)) return { error: "Non autorizzato", success: false };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata", success: false };

  const admin = createAdminClient();

  // Bulk insert new movements
  const newMovements = movements.filter((m) => m.status === "new");
  let inserted = 0;
  if (newMovements.length > 0) {
    const rows = newMovements.map((m) => ({
      organization_id: organizationId,
      collection_resource_id: collectionResourceId,
      direction: m.direction,
      amount: m.amount,
      transaction_date: m.transaction_date,
      description: m.description,
      reference: m.reference || null,
      reclassification_node_id: m.resolved_node_id || null,
      created_by: currentUser.profile.id,
    }));
    const { error } = await admin.from("transactions").insert(rows);
    if (error) {
      return { error: `Errore inserimento: ${error.message}`, success: false };
    }
    inserted = rows.length;
  }

  // Update existing movements (must be individual updates due to different IDs)
  let updated = 0;
  const updateMovements = movements.filter((m) => m.status === "updated" && m.existing_id);
  for (const m of updateMovements) {
    await admin
      .from("transactions")
      .update({
        description: m.description,
        reference: m.reference || null,
        reclassification_node_id: m.resolved_node_id || null,
      })
      .eq("id", m.existing_id!);
    updated++;
  }

  revalidatePath("/transactions");
  return { success: true, inserted, updated };
}
