import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const includeSystem = searchParams.get("includeSystem") === "true";

  const admin = createAdminClient();

  let query = admin.from("reclassification_templates").select("*");

  if (orgId) {
    query = query.or(`organization_id.eq.${orgId},is_template.eq.true`);
  } else if (includeSystem) {
    // Superadmin without org — only show system templates
    query = query.eq("is_template", true);
  } else {
    return NextResponse.json({ templates: [] });
  }

  const { data: templates, error } = await query
    .order("is_template", { ascending: false })
    .order("name");

  if (error) {
    console.error("Error fetching reclassification templates:", error);
    return NextResponse.json({ templates: [] });
  }

  return NextResponse.json({ templates: templates ?? [] });
}
