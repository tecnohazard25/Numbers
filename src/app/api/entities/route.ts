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

  // Base query — always fetch all columns
  let query = admin
    .from("entities")
    .select("*")
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

  if (!entities || entities.length === 0) {
    return NextResponse.json({ entities: [] });
  }

  // Enrich with relations based on type
  if (type === "room") {
    // Resolve room_workplace_id → workplace name
    const workplaceIds = [...new Set(entities.map((e) => e.room_workplace_id).filter(Boolean))];
    if (workplaceIds.length > 0) {
      const { data: workplaces } = await admin
        .from("entities")
        .select("id, name, code")
        .in("id", workplaceIds);
      const wpMap = new Map((workplaces ?? []).map((w) => [w.id, w]));
      for (const entity of entities) {
        (entity as Record<string, unknown>).room_workplace = entity.room_workplace_id ? wpMap.get(entity.room_workplace_id) ?? null : null;
      }
    }
  }

  if (type === "activity") {
    // Resolve activity_branch_id → branch name
    const branchIds = [...new Set(entities.map((e) => e.activity_branch_id).filter(Boolean))];
    if (branchIds.length > 0) {
      const { data: branches } = await admin
        .from("entities")
        .select("id, name, code")
        .in("id", branchIds);
      const brMap = new Map((branches ?? []).map((b) => [b.id, b]));
      for (const entity of entities) {
        (entity as Record<string, unknown>).activity_branch = entity.activity_branch_id ? brMap.get(entity.activity_branch_id) ?? null : null;
      }
    }

    // Resolve activity ↔ workplaces junction
    const activityIds = entities.map((e) => e.id);
    const { data: actWps } = await admin
      .from("entity_activity_workplaces")
      .select("activity_id, workplace_id")
      .in("activity_id", activityIds);
    if (actWps && actWps.length > 0) {
      const wpIds = [...new Set(actWps.map((j) => j.workplace_id))];
      const { data: workplaces } = await admin
        .from("entities")
        .select("id, name, code")
        .in("id", wpIds);
      const wpMap = new Map((workplaces ?? []).map((w) => [w.id, w]));
      for (const entity of entities) {
        const junctions = actWps.filter((j) => j.activity_id === entity.id);
        (entity as Record<string, unknown>).entity_activity_workplaces = junctions.map((j) => ({
          workplace_id: j.workplace_id,
          entities: wpMap.get(j.workplace_id) ?? null,
        }));
      }
    }
  }

  if (type === "doctor") {
    const doctorIds = entities.map((e) => e.id);

    // Resolve doctor ↔ branches junction
    const { data: docBranches } = await admin
      .from("entity_doctor_branches")
      .select("doctor_id, branch_id")
      .in("doctor_id", doctorIds);
    if (docBranches && docBranches.length > 0) {
      const branchIds = [...new Set(docBranches.map((j) => j.branch_id))];
      const { data: branches } = await admin
        .from("entities")
        .select("id, name, code")
        .in("id", branchIds);
      const brMap = new Map((branches ?? []).map((b) => [b.id, b]));
      for (const entity of entities) {
        const junctions = docBranches.filter((j) => j.doctor_id === entity.id);
        (entity as Record<string, unknown>).entity_doctor_branches = junctions.map((j) => ({
          branch_id: j.branch_id,
          entities: brMap.get(j.branch_id) ?? null,
        }));
      }
    }

    // Resolve doctor ↔ workplaces junction
    const { data: docWps } = await admin
      .from("entity_doctor_workplaces")
      .select("doctor_id, workplace_id")
      .in("doctor_id", doctorIds);
    if (docWps && docWps.length > 0) {
      const wpIds = [...new Set(docWps.map((j) => j.workplace_id))];
      const { data: workplaces } = await admin
        .from("entities")
        .select("id, name, code")
        .in("id", wpIds);
      const wpMap = new Map((workplaces ?? []).map((w) => [w.id, w]));
      for (const entity of entities) {
        const junctions = docWps.filter((j) => j.doctor_id === entity.id);
        (entity as Record<string, unknown>).entity_doctor_workplaces = junctions.map((j) => ({
          workplace_id: j.workplace_id,
          entities: wpMap.get(j.workplace_id) ?? null,
        }));
      }
    }
  }

  return NextResponse.json({ entities });
}
