import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ subjects: [], tags: [] });
  }

  const admin = createAdminClient();

  // Fetch subjects with all relations
  let query = admin
    .from("subjects")
    .select(
      "*, subject_addresses(*), subject_contacts(*), subject_tags(*, tags(*))"
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  const typeFilter = searchParams.get("type");
  if (typeFilter) {
    query = query.eq("type", typeFilter);
  }

  const search = searchParams.get("search");
  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,business_name.ilike.%${search}%,tax_code.ilike.%${search}%,vat_number.ilike.%${search}%`
    );
  }

  const { data: subjects, error } = await query;

  if (error) {
    console.error("Error fetching subjects:", error);
    return NextResponse.json({ subjects: [], tags: [] });
  }

  // If tag filter is specified, filter client-side (Supabase can't easily filter by junction)
  const tagFilter = searchParams.get("tagId");
  let filteredSubjects = subjects ?? [];
  if (tagFilter) {
    filteredSubjects = filteredSubjects.filter((s) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s.subject_tags as any[])?.some((st: any) => st.tag_id === tagFilter)
    );
  }

  // Fetch org tags for filter dropdown
  const { data: tags } = await admin
    .from("tags")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");

  return NextResponse.json({
    subjects: filteredSubjects,
    tags: tags ?? [],
  });
}
