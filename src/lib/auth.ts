import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getCurrentUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return null;
  }

  const { data: userRoles } = await admin
    .from("user_roles")
    .select("*, roles(name)")
    .eq("user_id", user.id);

  const roles = (userRoles ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ur: any) => ur.roles?.name as string
  );

  return {
    user,
    profile,
    roles: roles as string[],
    userName: `${profile.first_name} ${profile.last_name}`.trim() || user.email || "",
  };
}
