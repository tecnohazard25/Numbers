import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ roles: [] });
  }

  const admin = createAdminClient();

  const { data: userRoles } = await admin
    .from("user_roles")
    .select("*, roles(name)")
    .eq("user_id", user.id);

  const roles = (userRoles ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ur: any) => ur.roles?.name as string
  );

  return NextResponse.json({ roles });
}
