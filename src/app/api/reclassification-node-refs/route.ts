import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get("templateId");

  if (!templateId) {
    return NextResponse.json({ refs: [] });
  }

  const admin = createAdminClient();

  // Get all refs for nodes in this template
  const { data: nodes } = await admin
    .from("reclassification_nodes")
    .select("id")
    .eq("template_id", templateId);

  if (!nodes || nodes.length === 0) {
    return NextResponse.json({ refs: [] });
  }

  const nodeIds = nodes.map((n) => n.id);
  const { data: refs, error } = await admin
    .from("reclassification_node_refs")
    .select("total_node_id, ref_node_id")
    .in("total_node_id", nodeIds);

  if (error) {
    console.error("Error fetching reclassification node refs:", error);
    return NextResponse.json({ refs: [] });
  }

  return NextResponse.json({ refs: refs ?? [] });
}
