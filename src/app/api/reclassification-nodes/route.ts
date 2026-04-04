import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get("templateId");

  if (!templateId) {
    return NextResponse.json({ nodes: [] });
  }

  const admin = createAdminClient();

  const { data: nodes, error } = await admin
    .from("reclassification_nodes")
    .select("*")
    .eq("template_id", templateId)
    .order("order_index");

  if (error) {
    console.error("Error fetching reclassification nodes:", error);
    return NextResponse.json({ nodes: [] });
  }

  return NextResponse.json({ nodes: nodes ?? [] });
}
