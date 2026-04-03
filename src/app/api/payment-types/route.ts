import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ paymentTypes: [] });
  }

  const admin = createAdminClient();

  const { data: paymentTypes, error } = await admin
    .from("payment_types")
    .select("*")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("is_system", { ascending: false })
    .order("name");

  if (error) {
    console.error("Error fetching payment types:", error);
    return NextResponse.json({ paymentTypes: [] });
  }

  return NextResponse.json({ paymentTypes: paymentTypes ?? [] });
}
