import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const admin = createAdminClient();

  const { data: organizations } = await admin
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });

  return NextResponse.json({ organizations: organizations ?? [] });
}
