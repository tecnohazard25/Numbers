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

  const { data: userRoles } = await admin
    .from("user_roles")
    .select("*, roles(name)")
    .eq("user_id", user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles = (userRoles ?? []).map(
    (ur: any) => ur.roles?.name as string
  );

  // If impersonating, add superadmin role so sidebar keeps full access
  const effectiveRoles = isImpersonating
    ? [...new Set([...roles, "superadmin"])]
    : roles;

  return NextResponse.json({
    profile,
    roles: effectiveRoles,
    userName: `${profile.first_name} ${profile.last_name}`.trim() || user.email,
    impersonating: isImpersonating
      ? {
          userId: user.id,
          name: `${profile.first_name} ${profile.last_name}`.trim(),
          email: user.email,
        }
      : null,
  });
}
