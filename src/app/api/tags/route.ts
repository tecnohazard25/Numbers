import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ tags: [] });
  }

  const admin = createAdminClient();

  const { data: tags, error } = await admin
    .from("tags")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");

  if (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json({ tags: [] });
  }

  return NextResponse.json({ tags: tags ?? [] });
}
