import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;

  const admin = createAdminClient();

  const { data: subject, error } = await admin
    .from("subjects")
    .select(
      "*, subject_addresses(*), subject_contacts(*), subject_tags(*, tags(*))"
    )
    .eq("id", id)
    .single();

  if (error || !subject) {
    return NextResponse.json({ error: "Soggetto non trovato" }, { status: 404 });
  }

  return NextResponse.json({ subject });
}
