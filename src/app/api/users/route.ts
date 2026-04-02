import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  const admin = createAdminClient();

  // Fetch profiles
  let query = admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (orgId) {
    query = query.eq("organization_id", orgId);
  }

  const { data: profiles, error } = await query;

  if (error) {
    console.error("Error fetching profiles:", error);
    return NextResponse.json({ users: [], organizations: [] });
  }

  // Fetch roles for each user
  const userIds = (profiles ?? []).map((p) => p.id);
  const { data: allUserRoles } = userIds.length > 0
    ? await admin
        .from("user_roles")
        .select("*, roles(*)")
        .in("user_id", userIds)
    : { data: [] };

  // Fetch org names
  const orgIds = [...new Set((profiles ?? []).map((p) => p.organization_id).filter(Boolean))];
  const { data: orgs } = orgIds.length > 0
    ? await admin
        .from("organizations")
        .select("id, name")
        .in("id", orgIds)
    : { data: [] };

  const orgMap = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  // Get emails from auth
  const { data: authUsers } = await admin.auth.admin.listUsers();
  const emailMap = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, u.email])
  );

  // Build user objects
  const users = (profiles ?? []).map((p) => ({
    ...p,
    email: emailMap.get(p.id) ?? "",
    organizations: p.organization_id
      ? { name: orgMap.get(p.organization_id) ?? "" }
      : null,
    user_roles: (allUserRoles ?? [])
      .filter((ur) => ur.user_id === p.id)
      .map((ur) => ({ roles: ur.roles })),
  }));

  // Get all active organizations for filters
  const { data: allOrganizations } = await admin
    .from("organizations")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return NextResponse.json({
    users,
    organizations: allOrganizations ?? [],
  });
}
