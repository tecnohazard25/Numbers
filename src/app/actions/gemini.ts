"use server";

import type { GeminiResponse } from "@/types/supabase";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `Sei un assistente contabile specializzato nell'analisi di estratti conto bancari e registri di cassa.

Ti verrà fornito un documento (estratto conto PDF o dati Excel convertiti in testo).

Il tuo compito è:
1. Estrarre tutti i movimenti (entrate e uscite) presenti nel documento
2. Ignorare le righe di saldo (saldo iniziale, saldo finale, saldo progressivo)
3. Per ogni movimento, identificare:
   - data (formato ISO 8601: YYYY-MM-DD)
   - direzione: "in" per entrate/accrediti, "out" per uscite/addebiti
   - importo (numero positivo, sempre > 0)
   - descrizione (testo originale del movimento)
   - riferimento (numero operazione, CRO, RIF, se presente, altrimenti null)
4. Per ogni movimento, DEVI assegnare il codice full_code della voce del piano dei conti
   riclassificato più appropriata tra quelle fornite (solo foglie).
   REGOLE DI CLASSIFICAZIONE:
   - Le entrate (direction="in") vanno classificate su voci con segno [RICAVO]
   - Le uscite (direction="out") vanno classificate su voci con segno [COSTO]
   - Analizza la descrizione del movimento per determinare la natura:
     * Bonifici da pazienti/clienti → ricavi da prestazioni
     * Incassi POS/Bancomat → ricavi da prestazioni
     * Affitti, utenze, bollette → costi per servizi/locazione
     * Stipendi, buste paga → costi del personale
     * Rate prestito, leasing → oneri finanziari
     * Commissioni bancarie → oneri finanziari/spese bancarie
     * F24, tasse → imposte e tasse
     * Acquisti materiale, forniture → costi per materiali
   - Se non riesci a determinarlo, restituisci null (ma cerca sempre di classificare).
5. Identificare se il documento è un estratto conto bancario (bank_statement: true/false)
6. Se bank_statement = true, estrarre i totali del documento:
   - totale_entrate (somma di tutti gli accrediti)
   - totale_uscite (somma di tutti gli addebiti)

Rispondi SOLO con un oggetto JSON valido, senza testo aggiuntivo, nel seguente formato:

{
  "bank_statement": true,
  "document_totals": {
    "total_in": 12500.00,
    "total_out": 8300.50
  },
  "movements": [
    {
      "transaction_date": "2024-01-15",
      "direction": "in",
      "amount": 1500.00,
      "description": "Bonifico da Mario Rossi - Prestazione fisioterapia",
      "reference": "CRO123456",
      "suggested_node_full_code": "A.1.3"
    }
  ]
}`;

interface LeafNode {
  full_code: string;
  name: string;
  sign: "positive" | "negative";
}

/**
 * Call Gemini with text content directly (no base64 roundtrip)
 */
export async function callGeminiWithText(
  textContent: string,
  leafNodes: LeafNode[]
): Promise<{ success: true; data: GeminiResponse } | { success: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "GEMINI_API_KEY non configurata" };
  }

  const chartOfAccounts = leafNodes.length > 0
    ? `\n\nPiano dei conti disponibile (usa SOLO questi full_code per i suggerimenti):\n${leafNodes.map((n) => `- ${n.full_code}: ${n.name} [${n.sign === "positive" ? "RICAVO" : "COSTO"}]`).join("\n")}`
    : "";

  const requestBody = JSON.stringify({
    contents: [{
      parts: [
        { text: `Contenuto del documento (estratto conto o registro):\n\n${textContent}` },
        { text: SYSTEM_PROMPT + chartOfAccounts },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const t0 = Date.now();
  console.log(`[Gemini] Sending request (${(requestBody.length / 1024).toFixed(0)} KB)...`);

  try {
    let response: Response | null = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      if (response.status === 429 && attempt < 2) {
        const errBody = await response.text();
        console.warn(`[Gemini] Rate limited (429), attempt ${attempt + 1}: ${errBody.slice(0, 300)}`);
        const waitMs = (attempt + 1) * 3000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      break;
    }

    console.log(`[Gemini] Response received in ${((Date.now() - t0) / 1000).toFixed(1)}s, status: ${response?.status}`);

    if (!response || !response.ok) {
      const errorBody = response ? await response.text() : "No response";
      console.error("[Gemini] Error:", errorBody.slice(0, 500));
      const status = response?.status ?? 0;
      let hint = "";
      if (status === 429) {
        try {
          const errJson = JSON.parse(errorBody);
          const detail = errJson?.error?.message ?? "";
          hint = ` — ${detail || "quota esaurita, riprova tra qualche minuto"}`;
        } catch {
          hint = " — quota esaurita, riprova tra qualche minuto";
        }
      }
      else if (status === 400) {
        try {
          const errJson = JSON.parse(errorBody);
          hint = errJson?.error?.message ? ` — ${errJson.error.message}` : "";
        } catch {
          hint = ` — ${errorBody.slice(0, 200)}`;
        }
      }
      return { success: false, error: `Errore API Gemini: ${status}${hint}` };
    }

    const result = await response.json();
    const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      return { success: false, error: "Risposta Gemini vuota" };
    }

    const jsonStr = textResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed: GeminiResponse = JSON.parse(jsonStr);

    if (!Array.isArray(parsed.movements)) {
      return { success: false, error: "Formato risposta non valido" };
    }

    // Filter invalid movements
    parsed.movements = parsed.movements.filter(
      (m) => m.transaction_date && m.amount > 0 && (m.direction === "in" || m.direction === "out")
    );

    console.log(`[Gemini] Parsed ${parsed.movements.length} movements in ${((Date.now() - t0) / 1000).toFixed(1)}s total`);

    return { success: true, data: parsed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Gemini] Exception:", msg);
    return { success: false, error: `Errore Gemini: ${msg}` };
  }
}

/**
 * Classify a single transaction by description using Gemini.
 * Returns the suggested full_code or null if uncertain.
 */
export async function classifyTransactionAction(
  description: string,
  direction: "in" | "out",
  amount: number,
  leafNodes: { full_code: string; name: string; sign: "positive" | "negative" }[]
): Promise<{ success: true; full_code: string | null; confident: boolean } | { success: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "GEMINI_API_KEY non configurata" };
  if (leafNodes.length === 0) return { success: true, full_code: null, confident: false };

  const chart = leafNodes.map((n) => `- ${n.full_code}: ${n.name} [${n.sign === "positive" ? "RICAVO" : "COSTO"}]`).join("\n");

  const prompt = `Sei un assistente contabile. Dato il seguente movimento bancario, suggerisci il codice del piano dei conti più appropriato.

Movimento:
- Descrizione: ${description}
- Direzione: ${direction === "in" ? "ENTRATA" : "USCITA"}
- Importo: ${amount}€

Piano dei conti disponibile:
${chart}

REGOLE OBBLIGATORIE:
- Questo movimento è una ${direction === "in" ? "ENTRATA — DEVI scegliere SOLO conti con [RICAVO]" : "USCITA — DEVI scegliere SOLO conti con [COSTO]"}
- NON assegnare mai un conto [RICAVO] a un'uscita o un conto [COSTO] a un'entrata
- Analizza la descrizione per capire la natura del movimento (stipendio, affitto, prestazione sanitaria, commissione, ecc.)
- Rispondi SOLO con un JSON: {"full_code": "A.1.3", "confident": true}
- Se NON sei ragionevolmente sicuro, rispondi: {"full_code": null, "confident": false}`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) {
      return { success: false, error: `Errore API: ${response.status}` };
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { success: true, full_code: null, confident: false };

    const parsed = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    return {
      success: true,
      full_code: parsed.full_code ?? null,
      confident: parsed.confident ?? false,
    };
  } catch (e) {
    return { success: false, error: `Errore: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Classify multiple transactions in a single Gemini call (batch).
 */
export async function classifyTransactionsBatchAction(
  movements: { id: string; description: string; direction: "in" | "out"; amount: number }[],
  leafNodes: { full_code: string; name: string; sign: "positive" | "negative" }[]
): Promise<{ success: true; results: Record<string, { full_code: string | null; confident: boolean }> } | { success: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "GEMINI_API_KEY non configurata" };
  if (leafNodes.length === 0 || movements.length === 0) return { success: true, results: {} };

  const chart = leafNodes.map((n) => `- ${n.full_code}: ${n.name} [${n.sign === "positive" ? "RICAVO" : "COSTO"}]`).join("\n");

  const movementsList = movements.map((m, i) =>
    `${i + 1}. [ID: ${m.id}] "${m.description}" | ${m.direction === "in" ? "ENTRATA" : "USCITA"} | ${m.amount}€`
  ).join("\n");

  const prompt = `Sei un assistente contabile. Classifica ciascun movimento nel piano dei conti.

MOVIMENTI DA CLASSIFICARE:
${movementsList}

PIANO DEI CONTI:
${chart}

REGOLE OBBLIGATORIE:
- Le ENTRATE vanno SOLO su conti [RICAVO]
- Le USCITE vanno SOLO su conti [COSTO]
- Analizza la descrizione per capire la natura (prestazione sanitaria, affitto, stipendio, commissione, ecc.)
- Se non sei sicuro per un movimento, metti confident: false

Rispondi SOLO con un JSON array, un elemento per movimento:
[{"id": "...", "full_code": "A.1.3", "confident": true}, {"id": "...", "full_code": null, "confident": false}]`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      let hint = "";
      try { hint = ` — ${JSON.parse(errBody)?.error?.message ?? ""}`; } catch { hint = ""; }
      return { success: false, error: `Errore API: ${response.status}${hint}` };
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { success: true, results: {} };

    const parsed: Array<{ id: string; full_code: string | null; confident: boolean }> = JSON.parse(
      text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    );

    const results: Record<string, { full_code: string | null; confident: boolean }> = {};
    for (const item of parsed) {
      if (item.id) results[item.id] = { full_code: item.full_code ?? null, confident: item.confident ?? false };
    }
    return { success: true, results };
  } catch (e) {
    return { success: false, error: `Errore: ${e instanceof Error ? e.message : String(e)}` };
  }
}
