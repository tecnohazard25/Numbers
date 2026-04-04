import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const collectionResourceId = searchParams.get("collectionResourceId");

  if (!orgId || !collectionResourceId) {
    return NextResponse.json({ transactions: [] });
  }

  const admin = createAdminClient();

  let query = admin
    .from("transactions")
    .select(
      "*, subjects(id, first_name, last_name, business_name, type), transaction_attachments(id)"
    )
    .eq("organization_id", orgId)
    .eq("collection_resource_id", collectionResourceId)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });

  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  if (dateFrom) query = query.gte("transaction_date", dateFrom);
  if (dateTo) query = query.lte("transaction_date", dateTo);

  const direction = searchParams.get("direction");
  if (direction === "in" || direction === "out") {
    query = query.eq("direction", direction);
  }

  const search = searchParams.get("search");
  if (search) {
    query = query.or(
      `description.ilike.%${search}%,reference.ilike.%${search}%`
    );
  }

  const { data: transactions, error } = await query;

  if (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json({ transactions: [] });
  }

  // Resolve reclassification node names (separate query to avoid breaking if column doesn't exist)
  const txList = transactions ?? [];
  const nodeIds = [...new Set(txList.map((t: Record<string, unknown>) => t.reclassification_node_id).filter(Boolean))] as string[];
  let nodeMap: Record<string, { id: string; full_code: string; name: string }> = {};
  if (nodeIds.length > 0) {
    const { data: nodes } = await admin
      .from("reclassification_nodes")
      .select("id, full_code, name")
      .in("id", nodeIds);
    if (nodes) {
      for (const n of nodes) nodeMap[n.id] = n;
    }
  }

  const enriched = txList.map((t: Record<string, unknown>) => ({
    ...t,
    reclassification_nodes: t.reclassification_node_id ? nodeMap[t.reclassification_node_id as string] ?? null : null,
  }));

  return NextResponse.json({ transactions: enriched });
}
