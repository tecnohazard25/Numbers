import { describe, it, expect } from "vitest";

// Test the deduplication logic from import-transactions.ts

type TransactionDirection = "in" | "out";

interface ExistingTx {
  id: string;
  transaction_date: string;
  amount: number;
  direction: TransactionDirection;
  description: string;
  reference: string | null;
}

interface GeminiMovement {
  transaction_date: string;
  direction: TransactionDirection;
  amount: number;
  description: string;
  reference: string | null;
  suggested_node_full_code: string | null;
}

function buildDedupKey(date: string, amount: number, direction: string): string {
  return `${date}|${amount.toFixed(2)}|${direction}`;
}

function runDedup(
  movements: GeminiMovement[],
  existing: ExistingTx[]
): { newMovements: GeminiMovement[]; updatedMovements: { movement: GeminiMovement; existingId: string }[]; notFound: ExistingTx[] } {
  const existingMap = new Map<string, ExistingTx>();
  for (const tx of existing) {
    const key = buildDedupKey(tx.transaction_date, Number(tx.amount), tx.direction);
    existingMap.set(key, tx);
  }

  const newMovements: GeminiMovement[] = [];
  const updatedMovements: { movement: GeminiMovement; existingId: string }[] = [];
  const matchedIds = new Set<string>();

  for (const m of movements) {
    const key = buildDedupKey(m.transaction_date, m.amount, m.direction);
    const existingTx = existingMap.get(key);
    if (existingTx) {
      matchedIds.add(existingTx.id);
      updatedMovements.push({ movement: m, existingId: existingTx.id });
    } else {
      newMovements.push(m);
    }
  }

  const notFound = existing.filter((tx) => !matchedIds.has(tx.id));

  return { newMovements, updatedMovements, notFound };
}

describe("Import - Deduplication", () => {
  it("detects new movements", () => {
    const movements: GeminiMovement[] = [
      { transaction_date: "2025-01-15", direction: "in", amount: 100, description: "Test", reference: null, suggested_node_full_code: null },
    ];
    const { newMovements, updatedMovements, notFound } = runDedup(movements, []);
    expect(newMovements).toHaveLength(1);
    expect(updatedMovements).toHaveLength(0);
    expect(notFound).toHaveLength(0);
  });

  it("detects duplicate (update) movements", () => {
    const movements: GeminiMovement[] = [
      { transaction_date: "2025-01-15", direction: "in", amount: 100, description: "New desc", reference: null, suggested_node_full_code: null },
    ];
    const existing: ExistingTx[] = [
      { id: "e1", transaction_date: "2025-01-15", amount: 100, direction: "in", description: "Old desc", reference: null },
    ];
    const { newMovements, updatedMovements } = runDedup(movements, existing);
    expect(newMovements).toHaveLength(0);
    expect(updatedMovements).toHaveLength(1);
    expect(updatedMovements[0].existingId).toBe("e1");
  });

  it("detects not-found-in-file movements", () => {
    const movements: GeminiMovement[] = [];
    const existing: ExistingTx[] = [
      { id: "e1", transaction_date: "2025-01-15", amount: 100, direction: "in", description: "Old", reference: null },
    ];
    const { notFound } = runDedup(movements, existing);
    expect(notFound).toHaveLength(1);
    expect(notFound[0].id).toBe("e1");
  });

  it("matches on date + amount + direction only", () => {
    const movements: GeminiMovement[] = [
      { transaction_date: "2025-01-15", direction: "in", amount: 100, description: "Different desc", reference: "NEW-REF", suggested_node_full_code: "A.1" },
    ];
    const existing: ExistingTx[] = [
      { id: "e1", transaction_date: "2025-01-15", amount: 100, direction: "in", description: "Original desc", reference: "OLD-REF" },
    ];
    const { updatedMovements } = runDedup(movements, existing);
    expect(updatedMovements).toHaveLength(1); // matches despite different description/reference
  });

  it("does not match different directions", () => {
    const movements: GeminiMovement[] = [
      { transaction_date: "2025-01-15", direction: "in", amount: 100, description: "Test", reference: null, suggested_node_full_code: null },
    ];
    const existing: ExistingTx[] = [
      { id: "e1", transaction_date: "2025-01-15", amount: 100, direction: "out", description: "Test", reference: null },
    ];
    const { newMovements, updatedMovements } = runDedup(movements, existing);
    expect(newMovements).toHaveLength(1);
    expect(updatedMovements).toHaveLength(0);
  });

  it("does not match different amounts", () => {
    const movements: GeminiMovement[] = [
      { transaction_date: "2025-01-15", direction: "in", amount: 100.01, description: "Test", reference: null, suggested_node_full_code: null },
    ];
    const existing: ExistingTx[] = [
      { id: "e1", transaction_date: "2025-01-15", amount: 100, direction: "in", description: "Test", reference: null },
    ];
    const { newMovements } = runDedup(movements, existing);
    expect(newMovements).toHaveLength(1);
  });

  it("handles mixed new, updated, and not-found", () => {
    const movements: GeminiMovement[] = [
      { transaction_date: "2025-01-15", direction: "in", amount: 100, description: "Existing", reference: null, suggested_node_full_code: null },
      { transaction_date: "2025-01-20", direction: "out", amount: 50, description: "New", reference: null, suggested_node_full_code: null },
    ];
    const existing: ExistingTx[] = [
      { id: "e1", transaction_date: "2025-01-15", amount: 100, direction: "in", description: "Old", reference: null },
      { id: "e2", transaction_date: "2025-01-10", amount: 200, direction: "out", description: "Gone", reference: null },
    ];
    const { newMovements, updatedMovements, notFound } = runDedup(movements, existing);
    expect(newMovements).toHaveLength(1);
    expect(updatedMovements).toHaveLength(1);
    expect(notFound).toHaveLength(1);
    expect(notFound[0].id).toBe("e2");
  });
});

describe("Import - Dedup Key", () => {
  it("formats correctly", () => {
    expect(buildDedupKey("2025-01-15", 100, "in")).toBe("2025-01-15|100.00|in");
    expect(buildDedupKey("2025-12-31", 0.5, "out")).toBe("2025-12-31|0.50|out");
    expect(buildDedupKey("2025-01-01", 9999.99, "in")).toBe("2025-01-01|9999.99|in");
  });
});
