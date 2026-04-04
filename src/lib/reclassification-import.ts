import XLSX from "xlsx-js-style";

export interface ImportedNode {
  code: string;
  name: string;
  description: string | null;
  sign: "positive" | "negative";
  order_index: number;
  is_total: boolean;
  formula: string | null;
  parent_full_code: string | null;
  full_code: string;
}

export interface ImportedRef {
  total_full_code: string;
  ref_full_code: string;
}

export interface ImportedSchema {
  name: string;
  nodes: ImportedNode[];
  refs: ImportedRef[];
}

/** Parse a JSON schema file */
export function parseJsonImport(content: string): ImportedSchema {
  const data = JSON.parse(content);
  if (!data.nodes || !Array.isArray(data.nodes)) {
    throw new Error("Formato JSON non valido: manca l'array 'nodes'");
  }
  return {
    name: data.name ?? "Importato",
    nodes: data.nodes.map((n: Record<string, unknown>, i: number) => ({
      code: String(n.code ?? ""),
      name: String(n.name ?? ""),
      description: n.description ? String(n.description) : null,
      sign: n.sign === "negative" ? "negative" as const : "positive" as const,
      order_index: typeof n.order_index === "number" ? n.order_index : i,
      is_total: !!n.is_total,
      formula: n.formula ? String(n.formula) : null,
      parent_full_code: n.parent_code ? String(n.parent_code) : (n.parent_full_code ? String(n.parent_full_code) : null),
      full_code: String(n.full_code ?? n.code ?? ""),
    })),
    refs: (data.refs ?? []).map((r: Record<string, unknown>) => ({
      total_full_code: String(r.total_full_code ?? ""),
      ref_full_code: String(r.ref_full_code ?? ""),
    })),
  };
}

/** Parse an Excel schema file */
export function parseExcelImport(buffer: ArrayBuffer): ImportedSchema {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("Nessun foglio trovato nel file Excel");

  const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (rows.length < 2) throw new Error("Il file Excel è vuoto");

  // Skip header row
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c));

  const nodes: ImportedNode[] = [];
  const codeStack: string[] = []; // Track hierarchy by indentation

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rawCode = String(row[0] ?? "").trimEnd();
    const name = String(row[1] ?? "").trim();
    const description = row[2] ? String(row[2]).trim() : null;
    const signStr = String(row[3] ?? "").trim().toLowerCase();
    const isTotalStr = String(row[4] ?? "").trim().toLowerCase();
    const formula = row[5] ? String(row[5]).trim() : null;

    if (!rawCode && !name) continue;

    // Detect indentation level from leading spaces
    const indent = rawCode.length - rawCode.trimStart().length;
    const depth = Math.floor(indent / 2);
    const code = rawCode.trim();

    // Build full_code from depth
    codeStack.length = depth;
    codeStack.push(code);
    const full_code = codeStack.join(".");

    const parent_full_code = depth > 0 ? codeStack.slice(0, depth).join(".") : null;

    nodes.push({
      code,
      name,
      description,
      sign: signStr.includes("cost") || signStr === "costo" || signStr === "negative" ? "negative" : "positive",
      order_index: i,
      is_total: isTotalStr === "sì" || isTotalStr === "si" || isTotalStr === "yes" || isTotalStr === "true",
      formula,
      parent_full_code,
      full_code,
    });
  }

  return { name: "Importato da Excel", nodes, refs: [] };
}
