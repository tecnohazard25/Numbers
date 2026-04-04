"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY non configurata");

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  let response: Response | null = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });

    if (response.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
      continue;
    }
    break;
  }

  if (!response || !response.ok) {
    const errBody = response ? await response.text() : "No response";
    throw new Error(`Errore Gemini (${response?.status}): ${errBody.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// --- Activity Reconciliation (issued invoices only) ---

export interface ActivityMatch {
  line_id: string;
  line_description: string;
  suggested_activity_id: string | null;
  suggested_activity_name: string | null;
  confidence: "high" | "medium" | "low";
}

export async function reconcileActivitiesAction(invoiceId: string): Promise<
  { success: true; matches: ActivityMatch[] } | { error: string }
> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const admin = createAdminClient();
  const organizationId = currentUser.profile.organization_id;

  // Get invoice lines
  const { data: invoice } = await admin
    .from("invoices")
    .select("id, direction, organization_id")
    .eq("id", invoiceId)
    .single();

  if (!invoice || invoice.organization_id !== organizationId) return { error: "Fattura non trovata" };
  if (invoice.direction !== "issued") return { error: "La riconciliazione prestazioni è disponibile solo per fatture emesse" };

  const { data: lines } = await admin
    .from("invoice_lines")
    .select("id, line_number, description, total_price")
    .eq("invoice_id", invoiceId)
    .order("line_number");

  if (!lines || lines.length === 0) return { error: "Nessuna riga trovata" };

  // Get activities
  const { data: activities } = await admin
    .from("entities")
    .select("id, code, name, activity_avg_selling_price")
    .eq("organization_id", organizationId!)
    .eq("type", "activity")
    .eq("is_active", true);

  if (!activities || activities.length === 0) return { error: "Nessuna prestazione disponibile" };

  const prompt = `Sei un assistente contabile specializzato in centri medici.

Ti fornisco una lista di righe di fattura emessa e una lista di prestazioni (activities) disponibili.

Per ogni riga di fattura, suggerisci quale prestazione corrisponde basandoti sulla descrizione.
Se non riesci a determinarlo con ragionevole certezza, restituisci null.

Activities disponibili:
${JSON.stringify(activities.map((a) => ({ id: a.id, code: a.code, name: a.name })))}

Righe fattura:
${JSON.stringify(lines.map((l) => ({ line_id: l.id, description: l.description, total_price: l.total_price })))}

Rispondi SOLO con JSON:
{
  "matches": [
    { "line_id": "uuid", "suggested_activity_id": "uuid | null", "confidence": "high|medium|low" }
  ]
}`;

  try {
    const responseText = await callGemini(prompt);
    const parsed = JSON.parse(responseText);

    const matches: ActivityMatch[] = (parsed.matches ?? []).map((m: { line_id: string; suggested_activity_id: string | null; confidence: string }) => {
      const line = lines.find((l) => l.id === m.line_id);
      const activity = m.suggested_activity_id ? activities.find((a) => a.id === m.suggested_activity_id) : null;
      return {
        line_id: m.line_id,
        line_description: line?.description ?? "",
        suggested_activity_id: m.suggested_activity_id,
        suggested_activity_name: activity?.name ?? null,
        confidence: m.confidence ?? "low",
      };
    });

    // Update suggested in DB
    for (const match of matches) {
      if (match.suggested_activity_id) {
        await admin
          .from("invoice_lines")
          .update({
            suggested_activity_id: match.suggested_activity_id,
            activity_reconciliation_status: "suggested",
          })
          .eq("id", match.line_id);
      }
    }

    return { success: true, matches };
  } catch (e) {
    return { error: `Errore AI: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function confirmActivityMatchesAction(
  matches: { lineId: string; activityId: string }[]
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  for (const match of matches) {
    await admin
      .from("invoice_lines")
      .update({
        confirmed_activity_id: match.activityId,
        activity_reconciliation_status: "confirmed",
      })
      .eq("id", match.lineId);
  }

  revalidatePath("/invoices");
  return { success: true };
}

// --- Payment Schedule Reconciliation ---

export interface PaymentMatch {
  schedule_id: string;
  due_date: string;
  amount: number;
  suggested_transaction_id: string | null;
  suggested_transaction_desc: string | null;
  suggested_transaction_date: string | null;
  confidence: "high" | "medium" | "low";
}

export async function reconcilePaymentsAction(invoiceId: string): Promise<
  { success: true; matches: PaymentMatch[] } | { error: string }
> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const admin = createAdminClient();
  const organizationId = currentUser.profile.organization_id;

  // Get invoice with payment schedule
  const { data: invoice } = await admin
    .from("invoices")
    .select("id, direction, organization_id")
    .eq("id", invoiceId)
    .single();

  if (!invoice || invoice.organization_id !== organizationId) return { error: "Fattura non trovata" };

  const { data: schedules } = await admin
    .from("invoice_payment_schedule")
    .select("id, due_date, amount")
    .eq("invoice_id", invoiceId)
    .order("due_date");

  if (!schedules || schedules.length === 0) return { error: "Nessuna scadenza trovata" };

  // Get direction for matching transactions
  const txDirection = invoice.direction === "issued" ? "in" : "out";

  // Find date range for candidate transactions (min due_date - 30 days to max due_date + 30 days)
  const dates = schedules.map((s) => new Date(s.due_date).getTime());
  const minDate = new Date(Math.min(...dates) - 30 * 86400000).toISOString().split("T")[0];
  const maxDate = new Date(Math.max(...dates) + 30 * 86400000).toISOString().split("T")[0];

  const { data: transactions } = await admin
    .from("transactions")
    .select("id, transaction_date, amount, direction, description")
    .eq("organization_id", organizationId!)
    .eq("direction", txDirection)
    .gte("transaction_date", minDate)
    .lte("transaction_date", maxDate);

  if (!transactions || transactions.length === 0) return { error: "Nessun movimento candidato trovato nel periodo" };

  const prompt = `Sei un assistente contabile.

Ti fornisco le scadenze di una fattura e una lista di movimenti candidati nel periodo.

Per ogni scadenza, suggerisci quale movimento corrisponde al pagamento.
Criteri: importo simile (±1%), data vicina (±15 giorni), direzione coerente.
Se non trovi corrispondenza certa, restituisci null.

Scadenze:
${JSON.stringify(schedules.map((s) => ({ schedule_id: s.id, due_date: s.due_date, amount: s.amount, direction: txDirection })))}

Movimenti candidati:
${JSON.stringify(transactions.map((tx) => ({ transaction_id: tx.id, transaction_date: tx.transaction_date, amount: tx.amount, direction: tx.direction, description: tx.description })))}

Rispondi SOLO con JSON:
{
  "matches": [
    { "schedule_id": "uuid", "suggested_transaction_id": "uuid | null", "confidence": "high|medium|low" }
  ]
}`;

  try {
    const responseText = await callGemini(prompt);
    const parsed = JSON.parse(responseText);

    const matches: PaymentMatch[] = (parsed.matches ?? []).map((m: { schedule_id: string; suggested_transaction_id: string | null; confidence: string }) => {
      const schedule = schedules.find((s) => s.id === m.schedule_id);
      const tx = m.suggested_transaction_id ? transactions.find((t) => t.id === m.suggested_transaction_id) : null;
      return {
        schedule_id: m.schedule_id,
        due_date: schedule?.due_date ?? "",
        amount: schedule?.amount ?? 0,
        suggested_transaction_id: m.suggested_transaction_id,
        suggested_transaction_desc: tx?.description ?? null,
        suggested_transaction_date: tx?.transaction_date ?? null,
        confidence: m.confidence ?? "low",
      };
    });

    // Update suggested in DB
    for (const match of matches) {
      if (match.suggested_transaction_id) {
        await admin
          .from("invoice_payment_schedule")
          .update({
            suggested_transaction_id: match.suggested_transaction_id,
            transaction_reconciliation_status: "suggested",
          })
          .eq("id", match.schedule_id);
      }
    }

    return { success: true, matches };
  } catch (e) {
    return { error: `Errore AI: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function confirmPaymentMatchesAction(
  matches: { scheduleId: string; transactionId: string }[]
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  for (const match of matches) {
    await admin
      .from("invoice_payment_schedule")
      .update({
        confirmed_transaction_id: match.transactionId,
        transaction_reconciliation_status: "confirmed",
      })
      .eq("id", match.scheduleId);
  }

  revalidatePath("/invoices");
  return { success: true };
}

export async function excludePaymentMatchAction(scheduleId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  await admin
    .from("invoice_payment_schedule")
    .update({
      suggested_transaction_id: null,
      confirmed_transaction_id: null,
      transaction_reconciliation_status: "excluded",
    })
    .eq("id", scheduleId);

  revalidatePath("/invoices");
  return { success: true };
}
