import { describe, it, expect } from "vitest";

// Test the pure logic functions used in transactions page

type TransactionDirection = "in" | "out";

interface TransactionRow {
  id: string;
  direction: TransactionDirection;
  amount: number;
  is_balance_row: boolean;
  reclassification_node_id: string | null;
  reclassification_nodes: { id: string; full_code: string; name: string } | null;
}

// Running balance calculation (from transactions/page.tsx)
function calculateRunningBalance(
  transactions: TransactionRow[]
): (TransactionRow & { _balance: number })[] {
  let balance = 0;
  return transactions.map((tx) => {
    const amt = Number(tx.amount);
    if (tx.is_balance_row) {
      balance = tx.direction === "in" ? amt : -amt;
    } else {
      balance += tx.direction === "in" ? amt : -amt;
    }
    return { ...tx, _balance: balance };
  });
}

// Totals calculation (excludes balance rows)
function calculateTotals(transactions: TransactionRow[]) {
  let totalIn = 0;
  let totalOut = 0;
  for (const tx of transactions) {
    if (tx.is_balance_row) continue;
    if (tx.direction === "in") totalIn += Number(tx.amount);
    else totalOut += Number(tx.amount);
  }
  return { totalIn, totalOut };
}

// No-account row detection
function hasNoAccount(tx: TransactionRow): boolean {
  return !tx.is_balance_row && !tx.reclassification_nodes;
}

const makeTx = (overrides: Partial<TransactionRow> & { id: string }): TransactionRow => ({
  direction: "in",
  amount: 100,
  is_balance_row: false,
  reclassification_node_id: null,
  reclassification_nodes: null,
  ...overrides,
});

describe("Transactions - Running Balance", () => {
  it("calculates cumulative balance", () => {
    const txs = [
      makeTx({ id: "1", direction: "in", amount: 100 }),
      makeTx({ id: "2", direction: "out", amount: 30 }),
      makeTx({ id: "3", direction: "in", amount: 50 }),
    ];
    const result = calculateRunningBalance(txs);
    expect(result[0]._balance).toBe(100);
    expect(result[1]._balance).toBe(70);
    expect(result[2]._balance).toBe(120);
  });

  it("balance row resets the running balance", () => {
    const txs = [
      makeTx({ id: "1", direction: "in", amount: 100 }),
      makeTx({ id: "2", direction: "in", amount: 500, is_balance_row: true }),
      makeTx({ id: "3", direction: "out", amount: 30 }),
    ];
    const result = calculateRunningBalance(txs);
    expect(result[0]._balance).toBe(100);
    expect(result[1]._balance).toBe(500); // resets to 500
    expect(result[2]._balance).toBe(470); // 500 - 30
  });

  it("negative balance row", () => {
    const txs = [
      makeTx({ id: "1", direction: "in", amount: 100 }),
      makeTx({ id: "2", direction: "out", amount: 200, is_balance_row: true }),
    ];
    const result = calculateRunningBalance(txs);
    expect(result[1]._balance).toBe(-200);
  });

  it("empty array returns empty", () => {
    expect(calculateRunningBalance([])).toEqual([]);
  });
});

describe("Transactions - Totals", () => {
  it("sums in and out correctly", () => {
    const txs = [
      makeTx({ id: "1", direction: "in", amount: 100 }),
      makeTx({ id: "2", direction: "out", amount: 30 }),
      makeTx({ id: "3", direction: "in", amount: 50 }),
    ];
    const { totalIn, totalOut } = calculateTotals(txs);
    expect(totalIn).toBe(150);
    expect(totalOut).toBe(30);
  });

  it("excludes balance rows from totals", () => {
    const txs = [
      makeTx({ id: "1", direction: "in", amount: 100 }),
      makeTx({ id: "2", direction: "in", amount: 5000, is_balance_row: true }),
      makeTx({ id: "3", direction: "out", amount: 30 }),
    ];
    const { totalIn, totalOut } = calculateTotals(txs);
    expect(totalIn).toBe(100); // balance row excluded
    expect(totalOut).toBe(30);
  });

  it("empty array returns zeros", () => {
    const { totalIn, totalOut } = calculateTotals([]);
    expect(totalIn).toBe(0);
    expect(totalOut).toBe(0);
  });
});

describe("Transactions - No Account Detection", () => {
  it("detects rows without account", () => {
    const tx = makeTx({ id: "1", reclassification_nodes: null });
    expect(hasNoAccount(tx)).toBe(true);
  });

  it("does not flag rows with account", () => {
    const tx = makeTx({
      id: "1",
      reclassification_node_id: "abc",
      reclassification_nodes: { id: "abc", full_code: "A.1", name: "Test" },
    });
    expect(hasNoAccount(tx)).toBe(false);
  });

  it("does not flag balance rows even without account", () => {
    const tx = makeTx({ id: "1", is_balance_row: true, reclassification_nodes: null });
    expect(hasNoAccount(tx)).toBe(false);
  });

  it("flags rows with orphan node_id but no resolved node", () => {
    const tx = makeTx({
      id: "1",
      reclassification_node_id: "orphan-uuid",
      reclassification_nodes: null,
    });
    expect(hasNoAccount(tx)).toBe(true); // uses reclassification_nodes, not node_id
  });
});
