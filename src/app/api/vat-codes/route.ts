import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ vatCodes: [] });
  }

  const admin = createAdminClient();

  const includeDeactivated = searchParams.get("includeDeactivated") === "true";

  let query = admin
    .from("vat_codes")
    .select("*")
    .eq("organization_id", orgId)
    .order("code");

  if (!includeDeactivated) {
    query = query.eq("is_active", true);
  }

  const { data: vatCodes, error } = await query;

  if (error) {
    console.error("Error fetching VAT codes:", error);
    return NextResponse.json({ vatCodes: [] });
  }

  return NextResponse.json({ vatCodes: vatCodes ?? [] });
}
