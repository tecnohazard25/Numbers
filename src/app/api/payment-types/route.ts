import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ paymentTypes: [] });
  }

  const admin = createAdminClient();

  const includeDeactivated = searchParams.get("includeDeactivated") === "true";

  let query = admin
    .from("payment_types")
    .select("*")
    .eq("organization_id", orgId);

  if (!includeDeactivated) {
    query = query.is("deleted_at", null);
  }

  const { data: paymentTypes, error } = await query
    .order("name");

  if (error) {
    console.error("Error fetching payment types:", error);
    return NextResponse.json({ paymentTypes: [] });
  }

  return NextResponse.json({ paymentTypes: paymentTypes ?? [] });
}
