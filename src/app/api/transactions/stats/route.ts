import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const collectionResourceId = searchParams.get("collectionResourceId");

  if (!orgId || currentUser.profile.organization_id !== orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Base query — all non-balance transactions for this org (optionally filtered by resource)
  let query = admin
    .from("transactions")
    .select("transaction_date, direction, amount, reclassification_node_id, is_balance_row")
    .eq("organization_id", orgId)
    .eq("is_balance_row", false);

  if (collectionResourceId) {
    query = query.eq("collection_resource_id", collectionResourceId);
  }

  const { data: transactions, error } = await query;

  if (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const txs = transactions ?? [];

  // 1. Monthly aggregation (income vs expenses)
  const monthlyMap = new Map<string, { month: string; totalIn: number; totalOut: number }>();
  for (const tx of txs) {
    const month = tx.transaction_date.substring(0, 7); // YYYY-MM
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { month, totalIn: 0, totalOut: 0 });
    }
    const entry = monthlyMap.get(month)!;
    if (tx.direction === "in") entry.totalIn += Number(tx.amount);
    else entry.totalOut += Number(tx.amount);
  }
  const monthly = [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  // 2. Balance trend (cumulative by month)
  let cumBalance = 0;
  const balanceTrend = monthly.map((m) => {
    cumBalance += m.totalIn - m.totalOut;
    return { month: m.month, balance: Math.round(cumBalance * 100) / 100 };
  });

  // 3. By account (reclassification node)
  const nodeIds = [...new Set(txs.map((t) => t.reclassification_node_id).filter(Boolean))] as string[];
  let nodeMap: Record<string, { full_code: string; name: string }> = {};
  if (nodeIds.length > 0) {
    const { data: nodes } = await admin
      .from("reclassification_nodes")
      .select("id, full_code, name")
      .in("id", nodeIds);
    if (nodes) {
      for (const n of nodes) nodeMap[n.id] = { full_code: n.full_code, name: n.name };
    }
  }

  const accountMap = new Map<string, { name: string; totalIn: number; totalOut: number }>();
  for (const tx of txs) {
    const nodeId = tx.reclassification_node_id;
    const key = nodeId ?? "__unclassified__";
    const nodeName = nodeId && nodeMap[nodeId] ? `${nodeMap[nodeId].full_code} ${nodeMap[nodeId].name}` : "Non classificato";
    if (!accountMap.has(key)) {
      accountMap.set(key, { name: nodeName, totalIn: 0, totalOut: 0 });
    }
    const entry = accountMap.get(key)!;
    if (tx.direction === "in") entry.totalIn += Number(tx.amount);
    else entry.totalOut += Number(tx.amount);
  }

  // 4. Top costs (top 10 by totalOut)
  const topCosts = [...accountMap.values()]
    .filter((a) => a.totalOut > 0)
    .sort((a, b) => b.totalOut - a.totalOut)
    .slice(0, 10)
    .map((a) => ({ name: a.name, amount: Math.round(a.totalOut * 100) / 100 }));

  // 5. Top revenues (top 10 by totalIn)
  const topRevenues = [...accountMap.values()]
    .filter((a) => a.totalIn > 0)
    .sort((a, b) => b.totalIn - a.totalIn)
    .slice(0, 10)
    .map((a) => ({ name: a.name, amount: Math.round(a.totalIn * 100) / 100 }));

  // 6. Pie chart data (by account, total amount)
  const pieData = [...accountMap.values()]
    .map((a) => ({ name: a.name, value: Math.round((a.totalIn + a.totalOut) * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  // 7. Summary
  let totalIn = 0, totalOut = 0;
  for (const tx of txs) {
    if (tx.direction === "in") totalIn += Number(tx.amount);
    else totalOut += Number(tx.amount);
  }

  return NextResponse.json({
    summary: {
      totalIn: Math.round(totalIn * 100) / 100,
      totalOut: Math.round(totalOut * 100) / 100,
      net: Math.round((totalIn - totalOut) * 100) / 100,
      transactionCount: txs.length,
    },
    monthly,
    balanceTrend,
    topCosts,
    topRevenues,
    pieData,
  });
}
