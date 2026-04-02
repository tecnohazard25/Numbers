import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: organization } = await admin
    .from("organizations")
    .select("*")
    .eq("id", id)
    .single();

  return NextResponse.json({ organization });
}
