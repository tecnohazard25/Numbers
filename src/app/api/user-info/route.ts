import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ profile: null, roles: [], userName: "", impersonating: null });
  }

  const admin = createAdminClient();

  // Check if this is an impersonated session
  const cookieStore = await cookies();
  const realSuperadminId = cookieStore.get("real_superadmin_id")?.value;
  const isImpersonating = !!realSuperadminId && realSuperadminId !== user.id;

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ profile: null, roles: [], userName: "", impersonating: null });
  }

  let organizationName = "";
  if (profile.organization_id) {
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", profile.organization_id)
      .single();
    organizationName = org?.name ?? "";
  }

  const { data: userRoles } = await admin
    .from("user_roles")
    .select("*, roles(name)")
    .eq("user_id", user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles = (userRoles ?? []).map(
    (ur: any) => ur.roles?.name as string
  );

  return NextResponse.json({
    profile,
    roles,
    userName: `${profile.first_name} ${profile.last_name}`.trim() || user.email,
    organizationName,
    impersonating: isImpersonating
      ? {
          userId: user.id,
          name: `${profile.first_name} ${profile.last_name}`.trim(),
          email: user.email,
        }
      : null,
  });
}
