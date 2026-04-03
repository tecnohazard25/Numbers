import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ vatCodes: [] });
  }

  const admin = createAdminClient();

  const { data: vatCodes, error } = await admin
    .from("vat_codes")
    .select("*")
    .eq("organization_id", orgId)
    .order("code");

  if (error) {
    console.error("Error fetching VAT codes:", error);
    return NextResponse.json({ vatCodes: [] });
  }

  return NextResponse.json({ vatCodes: vatCodes ?? [] });
}
