import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: transaction, error } = await admin
    .from("transactions")
    .select(
      "*, subjects(id, first_name, last_name, business_name, type), transaction_attachments(*)"
    )
    .eq("id", id)
    .single();

  if (error || !transaction) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Verify user belongs to the transaction's org
  if (transaction.organization_id !== currentUser.profile.organization_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Resolve reclassification node
  let reclassification_nodes = null;
  if (transaction.reclassification_node_id) {
    const { data: node } = await admin
      .from("reclassification_nodes")
      .select("id, full_code, name")
      .eq("id", transaction.reclassification_node_id)
      .maybeSingle();
    reclassification_nodes = node;
  }

  return NextResponse.json({ transaction: { ...transaction, reclassification_nodes } });
}
