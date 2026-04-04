import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const type = searchParams.get("type");

  if (!orgId || !type) {
    return NextResponse.json({ entities: [] });
  }

  const admin = createAdminClient();
  const includeInactive = searchParams.get("includeInactive") === "true";

  // Build select string based on entity type for relation joins
  let selectString = "*";
  if (type === "room") {
    selectString = "*, room_workplace:entities!room_workplace_id(id, name, code)";
  } else if (type === "doctor") {
    selectString = "*, entity_doctor_branches(branch_id, entities:branch_id(id, name, code)), entity_doctor_workplaces(workplace_id, entities:workplace_id(id, name, code))";
  } else if (type === "activity") {
    selectString = "*, activity_branch:entities!activity_branch_id(id, name, code), entity_activity_workplaces(workplace_id, entities:workplace_id(id, name, code))";
  }

  let query = admin
    .from("entities")
    .select(selectString)
    .eq("organization_id", orgId)
    .eq("type", type);

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data: entities, error } = await query.order("name");

  if (error) {
    console.error("Error fetching entities:", error);
    return NextResponse.json({ entities: [] });
  }

  return NextResponse.json({ entities: entities ?? [] });
}
