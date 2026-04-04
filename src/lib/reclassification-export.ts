import XLSX from "xlsx-js-style";
import type { ReclassificationNode, ReclassificationNodeRef } from "@/types/supabase";
import { buildTree, flattenTreeWithDepth } from "./reclassification-utils";

// ─── Excel Export ───

export function exportToExcel(
  templateName: string,
  nodes: ReclassificationNode[],
  refs: ReclassificationNodeRef[]
) {
  const tree = buildTree(nodes);
  const allExpanded = new Set(nodes.map((n) => n.id));
  const flat = flattenTreeWithDepth(tree, allExpanded);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const refsMap = new Map<string, string[]>();
  for (const ref of refs) {
    const arr = refsMap.get(ref.total_node_id) ?? [];
    arr.push(ref.ref_node_id);
    refsMap.set(ref.total_node_id, arr);
  }

  function getFormula(node: ReclassificationNode): string {
    if (!node.is_total) return "";
    if (node.formula) return node.formula;
    const nodeRefs = refsMap.get(node.id);
    if (!nodeRefs || nodeRefs.length === 0) return "";
    return nodeRefs
      .map((id) => nodeMap.get(id)?.code ?? "?")
      .join(" + ");
  }

  const wsData = [
    ["Codice", "Nome", "Descrizione", "Segno", "Totale", "Formula"],
    ...flat.map((node) => [
      "  ".repeat(node.depth) + node.code,
      node.name,
      node.description ?? "",
      node.sign === "positive" ? "Ricavo" : "Costo",
      node.is_total ? "Sì" : "",
      getFormula(node),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Style header
  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "4472C4" } },
    alignment: { horizontal: "center" as const },
  };
  for (let c = 0; c < 6; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = headerStyle;
  }

  // Style total rows
  const totalStyle = {
    font: { bold: true },
    fill: { fgColor: { rgb: "FFF2CC" } },
  };
  for (let r = 1; r <= flat.length; r++) {
    if (flat[r - 1].is_total) {
      for (let c = 0; c < 6; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.s = totalStyle;
      }
    }
  }

  // Column widths
  ws["!cols"] = [
    { wch: 20 }, // Codice
    { wch: 40 }, // Nome
    { wch: 30 }, // Descrizione
    { wch: 10 }, // Segno
    { wch: 8 },  // Totale
    { wch: 25 }, // Formula
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Schema");
  XLSX.writeFile(wb, `${templateName}.xlsx`);
}

// ─── JSON Export ───

export function exportToJson(
  templateName: string,
  nodes: ReclassificationNode[],
  refs: ReclassificationNodeRef[]
) {
  const data = {
    version: 1,
    name: templateName,
    exportedAt: new Date().toISOString(),
    nodes: nodes.map((n) => ({
      code: n.code,
      name: n.name,
      description: n.description,
      sign: n.sign,
      order_index: n.order_index,
      is_total: n.is_total,
      formula: n.formula,
      parent_code: n.parent_id
        ? nodes.find((p) => p.id === n.parent_id)?.full_code ?? null
        : null,
      full_code: n.full_code,
    })),
    refs: refs.map((r) => ({
      total_full_code: nodes.find((n) => n.id === r.total_node_id)?.full_code ?? "",
      ref_full_code: nodes.find((n) => n.id === r.ref_node_id)?.full_code ?? "",
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${templateName}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
