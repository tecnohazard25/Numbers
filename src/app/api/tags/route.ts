import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ tags: [] });
  }

  const admin = createAdminClient();

  const includeDeactivated = searchParams.get("includeDeactivated") === "true";

  let query = admin
    .from("tags")
    .select("*, subject_tags(count)")
    .eq("organization_id", orgId)
    .order("name");

  if (!includeDeactivated) {
    query = query.eq("is_active", true);
  }

  const { data: tags, error } = await query;

  if (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json({ tags: [] });
  }

  // Map to include usage_count
  const tagsWithCount = (tags ?? []).map((tag) => ({
    ...tag,
    usage_count: (tag as unknown as { subject_tags: { count: number }[] }).subject_tags?.[0]?.count ?? 0,
    subject_tags: undefined,
  }));

  return NextResponse.json({ tags: tagsWithCount });
}
