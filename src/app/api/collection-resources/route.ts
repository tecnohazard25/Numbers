import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ resources: [] });
  }

  const admin = createAdminClient();

  const includeDeactivated = searchParams.get("includeDeactivated") === "true";

  let query = admin
    .from("collection_resources")
    .select("*")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("name");

  if (!includeDeactivated) {
    query = query.eq("is_active", true);
  }

  const { data: resources, error } = await query;

  if (error) {
    console.error("Error fetching collection resources:", error);
    return NextResponse.json({ resources: [] });
  }

  return NextResponse.json({ resources: resources ?? [] });
}
