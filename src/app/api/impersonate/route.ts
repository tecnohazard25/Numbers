import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";

const REAL_USER_COOKIE = "real_superadmin_id";

// Start impersonation
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // Check caller is superadmin
  const admin = createAdminClient();
  const { data: userRoles } = await admin
    .from("user_roles")
    .select("*, roles(name)")
    .eq("user_id", user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles = (userRoles ?? []).map((ur: any) => ur.roles?.name as string);
  if (!roles.includes("superadmin")) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "userId richiesto" }, { status: 400 });
  }

  // Generate a magic link / session for the target user
  // We use generateLink to get a token, then exchange it
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "", // will be overridden
  });

  // Alternative: use admin to get user email, then sign in as them
  const { data: targetAuth } = await admin.auth.admin.getUserById(userId);
  if (!targetAuth?.user?.email) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  // Save the real superadmin ID so we can restore later
  const cookieStore = await cookies();
  cookieStore.set(REAL_USER_COOKIE, user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1 hour
  });

  // Generate a one-time link for the target user to create a session
  const { data: signInData, error: signInError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetAuth.user.email,
  });

  if (signInError || !signInData) {
    return NextResponse.json({ error: "Errore nella generazione del link" }, { status: 500 });
  }

  // Return the token hash and verification type so the client can exchange it
  return NextResponse.json({
    success: true,
    tokenHash: signInData.properties?.hashed_token,
    email: targetAuth.user.email,
  });
}

// Stop impersonation — restore superadmin session
export async function DELETE() {
  const cookieStore = await cookies();
  const realSuperadminId = cookieStore.get(REAL_USER_COOKIE)?.value;

  if (!realSuperadminId) {
    return NextResponse.json({ error: "Nessuna impersonazione attiva" });
  }

  const admin = createAdminClient();

  // Get superadmin email
  const { data: superadminAuth } = await admin.auth.admin.getUserById(realSuperadminId);
  if (!superadminAuth?.user?.email) {
    cookieStore.delete(REAL_USER_COOKIE);
    return NextResponse.json({ error: "Superadmin non trovato" });
  }

  // Generate magic link for superadmin to restore session
  const { data: signInData, error: signInError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: superadminAuth.user.email,
  });

  if (signInError || !signInData) {
    cookieStore.delete(REAL_USER_COOKIE);
    return NextResponse.json({ error: "Errore nel ripristino" });
  }

  cookieStore.delete(REAL_USER_COOKIE);

  return NextResponse.json({
    success: true,
    tokenHash: signInData.properties?.hashed_token,
    email: superadminAuth.user.email,
  });
}
