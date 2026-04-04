import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ accounts: [] });
  }

  const admin = createAdminClient();

  const includeDeactivated = searchParams.get("includeDeactivated") === "true";

  let query = admin
    .from("sdi_accounts")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");

  if (!includeDeactivated) {
    query = query.eq("is_active", true);
  }

  const { data: accounts, error } = await query;

  if (error) {
    console.error("Error fetching SDI accounts:", error);
    return NextResponse.json({ accounts: [] });
  }

  return NextResponse.json({ accounts: accounts ?? [] });
}
