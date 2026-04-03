import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ resources: [] });
  }

  const admin = createAdminClient();

  const { data: resources, error } = await admin
    .from("collection_resources")
    .select("*")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("name");

  if (error) {
    console.error("Error fetching collection resources:", error);
    return NextResponse.json({ resources: [] });
  }

  return NextResponse.json({ resources: resources ?? [] });
}
